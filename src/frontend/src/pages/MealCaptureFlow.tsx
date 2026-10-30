/**
 * src/frontend/src/pages/MealCaptureFlow.tsx
 * Master orchestrator state machine for photo meal ingestion and confirmation.
 * Tuân thủ ADR-W3-03 (Two-Step Confirmation), ADR-W3-04 (Explicit state machine),
 * ADR-W3-05 (Image privacy & no storage leakage), và PSC-1..PSC-9.
 */

import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Camera, Edit3, ArrowLeft, AlertCircle } from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { useRecognizeFood } from '../hooks/useRecognizeFood';
import { initialDraftState, mealDraftReducer } from '../components/meal/mealDraftReducer';
import { CameraView } from '../components/meal/CameraView';
import { ImagePicker } from '../components/meal/ImagePicker';
import { CapturePreview } from '../components/meal/CapturePreview';
import { RecognitionProgress } from '../components/meal/RecognitionProgress';
import { UnrecognizedPanel } from '../components/meal/UnrecognizedPanel';
import { ManualEntryPanel } from '../components/meal/ManualEntryPanel';
import { MealReviewList } from '../components/meal/MealReviewList';
import { SaveSuccess } from '../components/meal/SaveSuccess';
import { getDefaultMealTypeByHour } from '../utils/date';
import { mealApi } from '../api/mealApi';
import { emitMealLogged } from '../utils/mealEvents';
import { useConnectivity } from '../app/ConnectivityProvider';
import { draftStore } from '../storage/draftStore';
import { useDraftAutosave } from '../offline/useDraftAutosave';
import { Check } from 'lucide-react';
import styles from '../components/meal/CaptureSurface.module.css';

export type CaptureMode =
  | 'idle'
  | 'cameraLive'
  | 'filePicker'
  | 'captured'
  | 'recognizing'
  | 'unrecognized'
  | 'manualEntry'
  | 'review'
  | 'saved';

export interface MealCaptureFlowProps {
  initialMode?: 'idle' | 'photo' | 'cameraLive' | 'filePicker' | 'manual' | 'manualEntry';
  onSaved?: () => void;
  onClose?: () => void;
}

export const MealCaptureFlow: React.FC<MealCaptureFlowProps> = ({
  initialMode = 'idle',
  onSaved,
  onClose,
}) => {
  const [mode, setMode] = useState<CaptureMode>(() => {
    if (initialMode === 'manual' || initialMode === 'manualEntry') return 'manualEntry';
    if (initialMode === 'photo' || initialMode === 'cameraLive') return 'cameraLive';
    return 'idle';
  });
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<string>(getDefaultMealTypeByHour());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [manualReason, setManualReason] = useState<string | undefined>();
  const [isSavedOffline, setIsSavedOffline] = useState(false);

  const { isOnline } = useConnectivity();

  // Hook quản lý máy ảnh WebRTC
  const { videoRef, status: cameraStatus, error: cameraError, start: startCamera, stop: stopCamera, capture: captureFrame } =
    useCamera();

  // Hook quản lý tiến trình nhận diện AI
  const { status: recStatus, slow: recSlow, run: runRecognition, cancel: cancelRecognition, reset: resetRecognition } =
    useRecognizeFood();

  // Reducer quản lý bản nháp các món ăn trong bữa
  const [draftState, draftDispatch] = useReducer(mealDraftReducer, {
    ...initialDraftState,
    mealType: selectedMealType,
  });

  const draftPayload = React.useMemo(() => {
    const validItems = draftState.items
      .filter((it) => it.food_id !== null && it.estimated_gram > 0)
      .map((it) => ({
        foodId: it.food_id,
        name: it.food_name,
        grams: it.estimated_gram,
      }));
    return {
      mealType: draftState.mealType,
      items: validItems,
    };
  }, [draftState.mealType, draftState.items]);

  const { clearDraft } = useDraftAutosave(draftPayload, {
    enabled: !isOnline && draftPayload.items.length > 0,
  });

  // Tự động bật camera nếu bắt đầu ở chế độ chụp ảnh
  useEffect(() => {
    if (initialMode === 'photo' || initialMode === 'cameraLive') {
      void startCamera().then((ok) => {
        if (!ok) {
          setMode('filePicker');
        }
      });
    }
  }, [initialMode, startCamera]);

  // Dọn dẹp máy ảnh khi chuyển khỏi màn hình cameraLive
  const prevModeRef = useRef<CaptureMode>(mode);
  useEffect(() => {
    if (prevModeRef.current === 'cameraLive' && mode !== 'cameraLive') {
      stopCamera();
    }
    prevModeRef.current = mode;
  }, [mode, stopCamera]);

  const handleStartCamera = async () => {
    const ok = await startCamera();
    if (ok) {
      setMode('cameraLive');
    } else {
      setMode('filePicker');
    }
  };

  const handleCapturePhoto = async () => {
    const photo = await captureFrame();
    if (photo) {
      setCapturedBlob(photo.blob);
      setMode('captured');
    }
  };

  const handleImageFileSelected = (file: File) => {
    setCapturedBlob(file);
    setMode('captured');
  };

  const handleConfirmPhotoAndRecognize = async () => {
    if (!capturedBlob) return;
    setMode('recognizing');

    const result = await runRecognition(capturedBlob, selectedMealType);
    if (!result) {
      // Có lỗi nhận diện hoặc kết nối AI: nếu không bị hủy giữa chừng thì chuyển sang nhập thủ công
      setManualReason('Không thể hoàn tất nhận diện AI do kết nối. Bạn có thể chọn món thủ công.');
      setMode((curr) => (curr === 'recognizing' ? 'manualEntry' : curr));
      return;
    }

    if (result.status === 'unrecognized' || result.detected_items.length === 0) {
      setMode('unrecognized');
    } else {
      draftDispatch({
        type: 'LOAD_RECOGNIZED',
        recognizedItems: result.detected_items,
        mealType: selectedMealType,
      });
      setMode('review');
    }
  };

  const handleCancelRecognition = () => {
    cancelRecognition();
    setMode('captured');
  };

  const handleConfirmSaveMeal = async () => {
    setIsSaving(true);
    setSaveError(null);

    const validItems = draftState.items
      .filter((it) => it.food_id !== null && it.estimated_gram > 0)
      .map((it) => ({
        food_id: it.food_id!,
        food_name: it.food_name,
        estimated_gram: it.estimated_gram,
      }));

    if (validItems.length === 0) {
      setSaveError('Vui lòng chọn ít nhất một món ăn với trọng lượng hợp lệ.');
      setIsSaving(false);
      return;
    }

    if (!isOnline) {
      try {
        await draftStore.saveDraft({
          mealType: draftState.mealType,
          items: validItems.map((v) => ({
            foodId: v.food_id,
            name: v.food_name,
            grams: v.estimated_gram,
          })),
        });
        setIsSavedOffline(true);
        setMode('saved');
        onSaved?.();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Không thể lưu bản nháp ngoại tuyến.';
        setSaveError(msg);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    try {
      await mealApi.logMeal({
        meal_type: draftState.mealType,
        items: validItems,
        image_path: null,
      });

      await clearDraft();
      // Phát sự kiện toàn cục để Dashboard tự động refetch (mục 3.2, 4.2)
      emitMealLogged({ itemCount: validItems.length });
      onSaved?.();
      setIsSavedOffline(false);
      setMode('saved');
    } catch (err: unknown) {
      // Giữ nguyên bản nháp khi lỗi (PSC-8)
      const msg = err instanceof Error ? err.message : 'Đã xảy ra lỗi khi lưu bữa ăn. Vui lòng thử lại.';
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetFlow = () => {
    draftDispatch({ type: 'RESET' });
    setCapturedBlob(null);
    setSaveError(null);
    setIsSavedOffline(false);
    resetRecognition();
    handleStartCamera();
  };

  return (
    <div className={styles.capture}>
      {/* Nút quay lại hoặc đóng */}
      {onClose && mode !== 'saved' && (
        <div className="mb-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg p-1"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Quay lại</span>
          </button>
        </div>
      )}

      {/* Trạng thái 1: Máy ảnh trực tiếp */}
      {mode === 'cameraLive' && (
        <CameraView
          videoRef={videoRef}
          status={cameraStatus}
          error={cameraError}
          onCapture={handleCapturePhoto}
          onSwitchToUpload={() => setMode('filePicker')}
          onClose={onClose}
        />
      )}

      {/* Trạng thái 2: Tải ảnh từ thiết bị (hoặc idle ban đầu) */}
      {(mode === 'filePicker' || mode === 'idle') && (
        <div className="w-full max-w-lg mx-auto bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-5">
          <div className="capture-entry-heading flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Tải ảnh đĩa ăn</h2>
              <p className="text-xs text-slate-500">Chọn ảnh rõ nét, có đầy đủ món ăn trong khung hình.</p>
            </div>
            <button
              type="button"
              onClick={handleStartCamera}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-200 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Bật Camera</span>
            </button>
          </div>

          <ImagePicker onImageSelected={handleImageFileSelected} />

          <div className="text-center pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setManualReason(undefined);
                setMode('manualEntry');
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-emerald-700 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Hoặc chọn món thủ công từ CSDL</span>
            </button>
          </div>
        </div>
      )}

      {/* Trạng thái 3: Xem lại ảnh đã chụp/chọn và chọn loại bữa */}
      {mode === 'captured' && capturedBlob && (
        <CapturePreview
          blob={capturedBlob}
          mealType={selectedMealType}
          onMealTypeChange={(type) => {
            setSelectedMealType(type);
            draftDispatch({ type: 'SET_MEAL_TYPE', mealType: type });
          }}
          onConfirmPhoto={handleConfirmPhotoAndRecognize}
          onRetake={() => {
            setCapturedBlob(null);
            handleStartCamera();
          }}
          isProcessing={recStatus === 'pending' || recStatus === 'slow'}
        />
      )}

      {/* Trạng thái 4: Đang nhận diện AI */}
      {mode === 'recognizing' && (
        <div className="space-y-4">
          <RecognitionProgress slow={recSlow} onCancel={handleCancelRecognition} />
          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                cancelRecognition();
                setManualReason('Đã chuyển sang nhập món thủ công theo yêu cầu.');
                setMode('manualEntry');
              }}
              className="inline-flex min-h-11 items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-emerald-700 bg-white border border-slate-200 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri-focus"
            >
              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Chuyển sang chọn món thủ công</span>
            </button>
          </div>
        </div>
      )}

      {/* Trạng thái 5: Không nhận diện được món */}
      {mode === 'unrecognized' && (
        <UnrecognizedPanel
          onRetake={() => {
            setCapturedBlob(null);
            handleStartCamera();
          }}
          onManualEntry={() => {
            setManualReason('Không nhận diện được món ăn. Vui lòng chọn món thủ công.');
            setMode('manualEntry');
          }}
        />
      )}

      {/* Trạng thái 6: Nhập thủ công từ CSDL */}
      {mode === 'manualEntry' && (
        <ManualEntryPanel
          mealType={draftState.mealType}
          items={draftState.items}
          dispatch={draftDispatch}
          onProceedToReview={() => setMode('review')}
          onSwitchToCamera={handleStartCamera}
          reason={manualReason}
        />
      )}

      {/* Trạng thái 7: Kiểm tra & Sửa khẩu phần trước khi lưu (Two-Step Confirmation Step 2) */}
      {mode === 'review' && (
        <div className="flex flex-col gap-4">
          {saveError && (
            <div role="alert" className="flex items-center gap-2 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
              <span>{saveError}</span>
            </div>
          )}

          <MealReviewList
            state={draftState}
            dispatch={draftDispatch}
            onConfirmSave={handleConfirmSaveMeal}
            onCancel={() => {
              if (onClose) onClose();
              else setMode('captured');
            }}
            isSaving={isSaving}
          />
        </div>
      )}

      {/* Trạng thái 8: Đã lưu thành công */}
      {mode === 'saved' && (
        isSavedOffline ? (
          <div className="w-full max-w-lg mx-auto bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <Check className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Đã lưu nháp ngoại tuyến</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bản ghi bữa ăn ({draftState.items.length} món) đã được mã hóa an toàn trên thiết bị của bạn.
              Khi có mạng lại, hệ thống sẽ nhắc bạn duyệt và đồng bộ lên máy chủ.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleResetFlow}
                className="inline-flex min-h-11 items-center justify-center px-6 py-2.5 rounded-xl bg-nutri-primary hover:bg-nutri-dark text-white text-xs font-semibold shadow-xs transition-colors"
              >
                Ghi nhận bữa ăn khác
              </button>
            </div>
          </div>
        ) : (
          <SaveSuccess
            itemCount={draftState.items.length}
            mealType={draftState.mealType}
            onReset={handleResetFlow}
          />
        )
      )}
    </div>
  );
};

export default MealCaptureFlow;
