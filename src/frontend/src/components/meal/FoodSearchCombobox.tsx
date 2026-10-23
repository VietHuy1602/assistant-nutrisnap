import React, { useEffect, useRef, useState } from 'react';
import { Search, Loader2, Check, X } from 'lucide-react';
import { useFoodSearch } from '../../hooks/useFoodSearch';
import type { FoodReferenceItem } from '../../types/api';

interface FoodSearchComboboxProps {
  onSelect: (food: FoodReferenceItem) => void;
  onClose?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export const FoodSearchCombobox: React.FC<FoodSearchComboboxProps> = ({
  onSelect,
  onClose,
  placeholder = 'Tìm tên món trong CSDL (ví dụ: Phở bò, Cơm tấm)...',
  autoFocus = true,
  className = '',
}) => {
  const { query, setQuery, results, loading, error, clear } = useFoodSearch(300);
  const [isOpen, setIsOpen] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  // Đóng khi click bên ngoài container
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Điều hướng bằng bàn phím
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;

      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        break;

      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          handleSelect(results[activeIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        onClose?.();
        break;
    }
  };

  const handleSelect = (food: FoodReferenceItem) => {
    onSelect(food);
    clear();
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Ô tìm kiếm input */}
      <div className="relative flex items-center">
        <Search className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen && results.length > 0}
          aria-haspopup="listbox"
          aria-controls="food-search-listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `food-option-${activeIndex}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-slate-300 rounded-xl shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        />
        {loading ? (
          <Loader2 className="absolute right-3.5 w-4 h-4 text-emerald-600 animate-spin" aria-hidden="true" />
        ) : query ? (
          <button
            type="button"
            onClick={clear}
            className="absolute right-3 p-0.5 text-slate-400 hover:text-slate-600 rounded-full"
            aria-label="Xóa từ khóa tìm kiếm"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {/* Danh sách kết quả thả xuống Listbox */}
      {isOpen && query.trim().length > 0 && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-lg">
          {loading && results.length === 0 && (
            <div className="p-3 text-xs text-center text-slate-500">Đang tìm kiếm trong CSDL 500 món...</div>
          )}

          {!loading && results.length === 0 && (
            <div className="p-3 text-xs text-center text-slate-500">
              Không tìm thấy món nào khớp với &quot;{query}&quot;. Vui lòng thử từ khóa khác.
            </div>
          )}

          {error && <div className="p-3 text-xs text-center text-red-600 bg-red-50">{error}</div>}

          {results.length > 0 && (
            <ul
              ref={listboxRef}
              id="food-search-listbox"
              role="listbox"
              aria-label="Danh sách món ăn gợi ý"
              className="py-1"
            >
              {results.map((food, idx) => {
                const isSelected = activeIndex === idx;
                return (
                  <li
                    key={food.id}
                    id={`food-option-${idx}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(food)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`flex items-center justify-between px-3.5 py-2 cursor-pointer text-sm transition-colors ${
                      isSelected ? 'bg-emerald-50 text-emerald-900' : 'text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="font-medium truncate">{food.food_name}</span>
                      <span className="text-xs text-slate-400">
                        {Math.round(food.calories_per_100g)} kcal / 100g · Đạm {food.protein_per_100g}g
                      </span>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
