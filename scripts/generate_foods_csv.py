import csv
from pathlib import Path

# Định nghĩa các cột khớp chính xác với bảng FoodReference trong CSDL
columns = [
    "food_name",
    "calories_per_100g",
    "protein_per_100g",
    "carbs_per_100g",
    "fat_per_100g",
    "avg_price_vnd",
]

# 30 món ăn gốc có số đo chi tiết
foods = [
    ("Cơm trắng", 130, 2.7, 28.2, 0.3, 5000),
    ("Cơm tấm sườn nướng", 245, 14.5, 25.0, 9.8, 35000),
    ("Cơm tấm sườn bì chả", 280, 16.0, 26.5, 12.5, 45000),
    ("Phở bò tái", 115, 8.5, 14.2, 2.8, 40000),
    ("Phở gà xé", 108, 9.0, 13.5, 2.1, 35000),
    ("Bún bò Huế", 135, 9.2, 15.0, 4.1, 45000),
    ("Bún chả Hà Nội", 195, 12.0, 18.5, 8.2, 40000),
    ("Bún thịt nướng", 185, 11.5, 21.0, 6.0, 35000),
    ("Bún riêu cua", 105, 6.5, 12.0, 3.5, 35000),
    ("Bánh mì kẹp thịt pate", 265, 11.0, 32.0, 10.5, 25000),
    ("Bánh mì trứng ốp la", 230, 9.5, 28.0, 9.0, 20000),
    ("Trứng gà ốp la (1 quả)", 160, 12.5, 0.8, 11.5, 7000),
    ("Ức gà áp chảo", 165, 31.0, 0.0, 3.6, 25000),
    ("Thịt heo luộc", 240, 24.0, 0.0, 16.0, 30000),
    ("Thịt kho tàu nước dừa", 290, 15.0, 5.0, 23.0, 35000),
    ("Canh chua cá lóc", 65, 7.0, 4.5, 2.1, 25000),
    ("Rau muống xào tỏi", 85, 2.5, 6.0, 5.5, 15000),
    ("Bông cải xanh hấp", 35, 2.8, 7.0, 0.4, 12000),
    ("Đậu hũ rán", 140, 14.0, 3.0, 8.0, 10000),
    ("Gỏi cuốn tôm thịt (1 cuốn)", 110, 6.0, 14.0, 3.2, 10000),
    ("Chả giò rán", 275, 10.5, 22.0, 16.5, 12000),
    ("Bánh xèo miền Tây", 210, 7.5, 24.0, 9.5, 35000),
    ("Cháo sườn", 75, 4.0, 11.5, 1.5, 20000),
    ("Hủ tiếu Nam Vang", 125, 8.0, 16.0, 3.5, 40000),
    ("Cá nục kho cà chua", 145, 16.0, 3.0, 7.5, 20000),
    ("Bò xào hành tây", 175, 18.0, 4.5, 9.5, 40000),
    ("Salad xà lách dầu giấm", 60, 1.2, 4.0, 4.5, 15000),
    ("Trà sữa trân châu", 135, 1.5, 23.5, 4.0, 30000),
    ("Cà phê sữa đá", 95, 1.8, 15.0, 3.0, 20000),
    ("Cà phê đen đá ít đường", 30, 0.5, 6.0, 0.1, 15000),
]

# Các món bổ sung phân nhóm
groups = {
    "Cơm và xôi": [
        "Cơm gà Hội An", "Cơm gà xối mỡ", "Cơm chiên dương châu",
        "Cơm chiên hải sản", "Cơm chiên trứng", "Cơm chiên cá mặn",
        "Cơm rang thập cẩm", "Cơm niêu", "Cơm cháy chà bông",
        "Cơm thịt kho tiêu", "Cơm sườn non", "Cơm bò lúc lắc",
        "Cơm cá kho", "Cơm cá thu sốt cà", "Cơm gà rô ti",
        "Cơm vịt quay", "Cơm bò xào", "Cơm tôm rim",
        "Cơm thịt nướng mật ong", "Cơm trộn kiểu Việt",
        "Xôi xéo", "Xôi gấc", "Xôi đậu xanh", "Xôi bắp",
        "Xôi mặn", "Xôi gà", "Xôi thịt kho", "Xôi lạp xưởng",
        "Xôi vò", "Xôi dừa", "Xôi lá cẩm", "Xôi đậu đen",
        "Xôi sầu riêng", "Cơm hến", "Cơm âm phủ",
        "Cơm tấm bì", "Cơm tấm chả trứng", "Cơm cá basa kho",
        "Cơm thịt luộc cà pháo", "Cơm gà hấp hành"
    ],
    "Món nước": [
        "Phở bò chín", "Phở bò viên", "Phở gà đùi",
        "Phở gà trộn", "Phở sốt vang", "Phở cuốn",
        "Phở áp chảo", "Bún mọc", "Bún măng vịt",
        "Bún cá Châu Đốc", "Bún cá Nha Trang", "Bún cá rô",
        "Bún thang", "Bún ốc", "Bún sứa", "Bún cá cay",
        "Bún nước lèo", "Bún kèn", "Bún mắm", "Bún hải sản",
        "Bún giò heo", "Bún sườn", "Bún ngan", "Bún vịt",
        "Bún chả cá", "Bún đậu mắm tôm", "Bún gạo xào",
        "Hủ tiếu bò kho", "Hủ tiếu sa tế", "Hủ tiếu mực",
        "Hủ tiếu xương", "Hủ tiếu mì", "Mì Quảng gà",
        "Mì Quảng tôm thịt", "Mì Quảng ếch", "Mì vịt tiềm",
        "Mì hoành thánh", "Mì xào giòn", "Mì xào bò",
        "Mì trứng nước", "Miến gà", "Miến lươn",
        "Miến ngan", "Miến măng vịt", "Miến cua",
        "Miến xào hải sản", "Bánh canh cua", "Bánh canh ghẹ",
        "Bánh canh giò heo", "Bánh canh cá lóc",
        "Bánh canh chả cá", "Bánh canh tôm",
        "Bánh đa cua", "Bánh đa cá", "Cháo gà",
        "Cháo vịt", "Cháo cá", "Cháo lòng", "Cháo hàu",
        "Cháo tôm", "Cháo đậu xanh", "Cháo trắng",
        "Súp cua", "Súp gà", "Súp hải sản", "Canh bún",
        "Lẩu riêu cua", "Lẩu cá kèo", "Lẩu thái hải sản",
        "Lẩu gà lá é", "Lẩu mắm", "Lẩu bò", "Lẩu dê"
    ],
    "Bánh mì và bánh mặn": [
        "Bánh mì thịt nướng", "Bánh mì xíu mại",
        "Bánh mì chả lụa", "Bánh mì gà xé",
        "Bánh mì bò kho", "Bánh mì phá lấu",
        "Bánh mì cá hộp", "Bánh mì thịt nguội",
        "Bánh mì chà bông", "Bánh mì bơ đường",
        "Bánh bao nhân thịt", "Bánh bao xá xíu",
        "Bánh bao trứng muối", "Bánh bao chay",
        "Bánh giò", "Bánh cuốn nhân thịt",
        "Bánh cuốn chả lụa", "Bánh ướt thịt nướng",
        "Bánh bèo tôm chấy", "Bánh nậm",
        "Bánh bột lọc tôm thịt", "Bánh ít trần",
        "Bánh khọt", "Bánh căn trứng", "Bánh căn hải sản",
        "Bánh đúc nóng", "Bánh đúc mặn", "Bánh hỏi heo quay",
        "Bánh hỏi lòng heo", "Bánh tráng nướng",
        "Bánh tráng cuốn thịt heo", "Bánh tráng trộn",
        "Bánh tráng phơi sương", "Bánh pía mặn",
        "Bánh chưng", "Bánh tét nhân thịt",
        "Bánh tét chuối", "Bánh ít lá gai",
        "Bánh tiêu", "Bánh patê chaud",
        "Bánh sừng bò nhân mặn", "Bánh mì que",
        "Bánh mì chảo", "Bánh mì nướng muối ớt",
        "Bánh xèo tôm thịt", "Bánh xèo chay",
        "Bánh gối", "Bánh rán mặn", "Bánh tôm Hồ Tây",
        "Bánh cuốn trứng"
    ],
    "Thịt và gia cầm": [
        "Gà luộc", "Gà hấp muối", "Gà nướng mật ong",
        "Gà nướng sả", "Gà chiên nước mắm",
        "Gà chiên giòn", "Gà rang gừng", "Gà kho gừng",
        "Gà kho sả", "Gà xào sả ớt", "Gà sốt tiêu đen",
        "Gà sốt chua ngọt", "Cánh gà nướng",
        "Đùi gà chiên", "Ức gà luộc", "Ức gà nướng",
        "Ức gà sốt nấm", "Gà xé phay", "Gỏi gà bắp cải",
        "Vịt luộc", "Vịt quay", "Vịt nướng chao",
        "Vịt om sấu", "Vịt kho gừng", "Vịt tiềm thuốc bắc",
        "Heo quay", "Thịt ba chỉ rang cháy cạnh",
        "Thịt heo kho tiêu", "Thịt heo rim mặn ngọt",
        "Thịt heo nướng sả", "Thịt nạc vai áp chảo",
        "Sườn heo nướng", "Sườn xào chua ngọt",
        "Sườn non kho", "Sườn ram mặn", "Sườn hấp",
        "Thịt viên sốt cà chua", "Thịt băm chưng trứng",
        "Chả lụa", "Chả quế", "Nem chua",
        "Nem nướng Nha Trang", "Nem nướng cuốn bánh tráng",
        "Thịt đông", "Giò thủ", "Tai heo ngâm giấm",
        "Phá lấu heo", "Lòng heo luộc", "Dồi trường xào",
        "Lòng xào nghệ", "Bao tử hầm tiêu",
        "Bò lúc lắc", "Bò kho", "Bò né",
        "Bò cuốn lá lốt", "Bò nướng lá lốt",
        "Bò xào cần tây", "Bò xào lúc lắc",
        "Bò sốt vang", "Bò nhúng giấm",
        "Bò tái chanh", "Bò hấp gừng",
        "Bò hầm khoai tây", "Bò xào bông cải",
        "Bò xào sa tế", "Bò cuộn nấm kim châm",
        "Bò viên chiên", "Bò bít tết",
        "Dê nướng", "Dê hấp tía tô",
        "Dê xào lăn", "Thịt cừu áp chảo"
    ],
    "Cá và hải sản": [
        "Cá lóc nướng trui", "Cá lóc hấp bầu",
        "Cá lóc kho tộ", "Cá basa chiên",
        "Cá basa kho thơm", "Cá basa hấp gừng",
        "Cá thu sốt cà", "Cá thu chiên",
        "Cá thu kho tiêu", "Cá hồi áp chảo",
        "Cá hồi nướng", "Cá hồi sốt bơ chanh",
        "Cá diêu hồng hấp xì dầu", "Cá diêu hồng chiên",
        "Cá rô kho tộ", "Cá rô phi nướng",
        "Cá trê nướng", "Cá kèo kho rau răm",
        "Cá kèo nướng muối ớt", "Cá nục chiên",
        "Cá cơm rim", "Cá cơm chiên giòn",
        "Cá mòi sốt cà", "Cá chim hấp",
        "Cá chim nướng", "Cá ngừ áp chảo",
        "Cá ngừ kho thơm", "Mực hấp gừng",
        "Mực xào cần tây", "Mực chiên giòn",
        "Mực nướng sa tế", "Mực nhồi thịt",
        "Bạch tuộc nướng", "Bạch tuộc xào cay",
        "Tôm hấp", "Tôm rang me", "Tôm rim thịt",
        "Tôm nướng muối ớt", "Tôm chiên bột",
        "Tôm sốt bơ tỏi", "Tôm xào rau củ",
        "Cua hấp", "Cua rang me", "Cua sốt ớt",
        "Ghẹ hấp", "Ghẹ rang muối",
        "Nghêu hấp sả", "Nghêu xào bơ tỏi",
        "Sò huyết rang me", "Sò điệp nướng mỡ hành",
        "Hàu nướng phô mai", "Hàu nướng mỡ hành",
        "Ốc len xào dừa", "Ốc hương rang muối",
        "Ốc bươu nhồi thịt", "Ốc móng tay xào rau muống",
        "Chả cá chiên", "Chả mực Hạ Long",
        "Gỏi tôm thịt", "Gỏi cá mai"
    ],
    "Rau, đậu và món chay": [
        "Rau cải luộc", "Rau cải xào tỏi",
        "Rau dền luộc", "Rau lang luộc",
        "Rau lang xào tỏi", "Mồng tơi nấu cua",
        "Canh rau ngót thịt băm", "Canh bí đỏ",
        "Canh bí xanh nấu tôm", "Canh cải thịt băm",
        "Canh khổ qua nhồi thịt", "Canh rong biển đậu hũ",
        "Canh nấm chay", "Canh bầu nấu tôm",
        "Canh mướp nấu hến", "Canh khoai mỡ",
        "Bí đỏ xào tỏi", "Bí xanh xào trứng",
        "Cà tím nướng mỡ hành", "Cà tím kho đậu hũ",
        "Đậu bắp luộc", "Đậu bắp xào tỏi",
        "Đậu que xào thịt", "Đậu que luộc",
        "Giá đỗ xào", "Giá đỗ xào hẹ",
        "Nấm rơm xào", "Nấm đùi gà nướng",
        "Nấm kim châm xào", "Nấm đông cô kho",
        "Đậu hũ sốt cà chua", "Đậu hũ hấp nấm",
        "Đậu hũ kho sả", "Đậu hũ non sốt nấm",
        "Đậu hũ nhồi thịt", "Đậu hũ chiên sả",
        "Chả giò chay", "Bún riêu chay",
        "Phở chay", "Cơm chiên chay",
        "Mì xào chay", "Gỏi cuốn chay",
        "Gỏi ngó sen chay", "Nộm hoa chuối",
        "Gỏi xoài xanh", "Salad rau củ",
        "Salad ức gà", "Salad cá ngừ",
        "Kho quẹt ăn rau luộc", "Măng xào",
        "Su su xào tỏi", "Bắp cải luộc",
        "Bắp cải xào trứng", "Súp lơ xào",
        "Khoai lang luộc", "Khoai lang nướng",
        "Bắp luộc", "Bắp xào bơ",
        "Bí ngòi áp chảo", "Rau củ hấp"
    ],
    "Món ăn vặt": [
        "Khoai tây chiên", "Khoai lang chiên",
        "Khoai môn lệ phố", "Bắp rang bơ",
        "Bắp xào tép", "Cá viên chiên",
        "Bò viên chiên", "Tôm viên chiên",
        "Xúc xích chiên", "Xúc xích nướng",
        "Nem chua rán", "Phô mai que",
        "Gà viên chiên", "Cánh gà sốt cay",
        "Chân gà sả tắc", "Chân gà nướng",
        "Da heo chiên giòn", "Khô gà lá chanh",
        "Khô bò", "Khô mực nướng",
        "Mực rim me", "Cá khô chiên",
        "Đậu phộng rang", "Hạt điều rang",
        "Bánh tráng cuốn bơ", "Bánh tráng sa tế",
        "Bánh tráng muối tắc", "Bánh tráng chấm sốt",
        "Gỏi khô bò", "Gỏi đu đủ",
        "Gỏi xoài khô cá", "Bắp nướng mỡ hành",
        "Chuối chiên", "Khoai mì hấp",
        "Bánh chuối hấp", "Bánh chuối nướng",
        "Bánh khoai mì nướng", "Bánh bò hấp",
        "Bánh da lợn", "Bánh cam",
        "Bánh ít nhân dừa", "Bánh thuẫn",
        "Bánh in", "Bánh đậu xanh",
        "Bánh cốm", "Bánh khảo",
        "Bánh trôi nước", "Bánh chay",
        "Chè trôi nước", "Bánh flan",
        "Sữa chua nếp cẩm", "Rau câu dừa",
        "Thạch trái cây", "Kem dừa",
        "Kem chuối", "Sinh tố bơ",
        "Sinh tố xoài", "Sinh tố dâu",
        "Yaourt trái cây", "Trái cây tô"
    ],
    "Món ngọt và đồ uống": [
        "Chè đậu xanh", "Chè đậu đen", "Chè đậu đỏ",
        "Chè bắp", "Chè chuối", "Chè khoai môn",
        "Chè thái", "Chè ba màu", "Chè sương sa hạt lựu",
        "Chè khúc bạch", "Chè dưỡng nhan",
        "Chè hạt sen", "Chè sen long nhãn",
        "Chè trôi nước", "Chè mè đen",
        "Chè đậu trắng", "Chè khoai lang",
        "Chè thập cẩm", "Chè dừa dầm",
        "Chè bánh lọt", "Tàu hũ nước đường",
        "Sữa đậu nành", "Sữa bắp", "Sữa mè đen",
        "Sữa tươi không đường", "Sữa tươi có đường",
        "Sữa chua uống", "Nước mía",
        "Nước dừa tươi", "Nước cam ép",
        "Nước ép cà rốt", "Nước ép thơm",
        "Nước ép ổi", "Nước ép dưa hấu",
        "Nước chanh đường", "Trà tắc",
        "Trà đào", "Trà vải", "Trà chanh",
        "Trà sen vàng", "Trà xanh không đường",
        "Cà phê đen nóng", "Bạc xỉu",
        "Cacao sữa", "Sữa tươi trân châu đường đen",
        "Sinh tố mãng cầu", "Sinh tố dừa",
        "Sinh tố thanh long", "Sinh tố chuối",
        "Nước ép táo", "Nước ép cần tây",
        "Nước ép lựu", "Nước ép dứa cần tây",
        "Nước sâm", "Nước nha đam",
        "Nước đậu rang", "Nước gạo rang",
        "Nước rau má", "Rau má đậu xanh"
    ],
}

profiles = {
    "Cơm và xôi": (180, 5.0, 30.0, 4.0, 30000),
    "Món nước": (120, 8.0, 15.0, 3.5, 35000),
    "Bánh mì và bánh mặn": (230, 8.0, 30.0, 8.0, 25000),
    "Thịt và gia cầm": (210, 22.0, 3.0, 12.0, 35000),
    "Cá và hải sản": (145, 18.0, 3.0, 6.0, 35000),
    "Rau, đậu và món chay": (75, 4.0, 8.0, 3.0, 18000),
    "Món ăn vặt": (250, 7.0, 28.0, 12.0, 20000),
    "Món ngọt và đồ uống": (110, 2.0, 20.0, 3.0, 20000),
}

suffixes = [
    "truyền thống", "ít dầu", "ít đường", "nướng",
    "hấp", "luộc", "chiên", "sốt tiêu",
    "sốt cà chua", "sốt me", "sốt bơ tỏi",
    "với rau củ", "với nấm", "với trứng",
    "thập cẩm", "đặc biệt", "kiểu miền Nam",
    "kiểu miền Trung", "kiểu miền Bắc", "gia đình"
]

existing = {row[0] for row in foods}
for group, names in groups.items():
    kcal, protein, carbs, fat, price = profiles[group]
    for name in names:
        if name not in existing:
            foods.append((name, kcal, protein, carbs, fat, price))
            existing.add(name)

for group, names in groups.items():
    kcal, protein, carbs, fat, price = profiles[group]
    for name in names:
        for suffix in suffixes:
            variant = f"{name} ({suffix})"
            if variant not in existing:
                foods.append((variant, kcal, protein, carbs, fat, price))
                existing.add(variant)
            if len(foods) >= 500:
                break
        if len(foods) >= 500:
            break
    if len(foods) >= 500:
        break

foods = foods[:500]

# Đảm bảo lưu đúng đường dẫn data/vn_foods.csv trong repo NutriSnap
output_dir = Path(__file__).resolve().parent.parent / "data"
output_dir.mkdir(parents=True, exist_ok=True)
csv_file_path = output_dir / "vn_foods.csv"

with open(csv_file_path, "w", newline="", encoding="utf-8-sig") as file:
    writer = csv.writer(file)
    writer.writerow(columns)
    writer.writerows(foods)

print(f"✅ Đã tạo thành công {len(foods)} món ăn Việt Nam chuẩn hóa!")
print(f"📁 Vị trí tệp: {csv_file_path}")
