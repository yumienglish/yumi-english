# Thư viện Yumi: kho tài liệu chung của cô và trợ lý

Trang dạng bảng giống Padlet. Mỗi **pack** là một cột, và cô cùng trợ lý đều đăng được file, link hoặc ghi chú vào đó. Bài đăng mặc định **thu gọn thành một dòng**. Bấm vào dòng đó để xem mô tả, tag và ảnh xem trước.

## Dữ liệu nằm ở đâu?

| Thứ gì | Lưu ở đâu |
|---|---|
| File tải lên (PDF, Word, ảnh, mp3…) | **Google Drive của cô**, thư mục `📚 Thư viện Yumi`. Mỗi pack là một thư mục con cùng tên |
| Danh sách bài đăng (tiêu đề, tag, mô tả, người đăng, ngày) | Google Sheet **`Thư viện Yumi – dữ liệu`** trong thư mục trên. Tab `PACKS` chứa danh sách pack, tab `ITEMS` chứa danh sách bài |
| Trang web | GitHub Pages, cùng chỗ với trang bài tập. Trang **không chứa dữ liệu** và chỉ hiện tài liệu khi nhập đúng mã truy cập |

- **Xóa một bài:** file được chuyển vào **Thùng rác Drive** và khôi phục được trong 30 ngày. Dòng của bài trong Sheet vẫn còn, chỉ bị đánh dấu ở cột "Đã xóa".
- **Không nên sửa tay** cột ID trong Sheet. Các cột khác như tiêu đề, tag hay mô tả thì sửa được, sau đó bấm 🔄 trên trang để cập nhật.

---

## A. Cài máy chủ (Google Apps Script), làm 1 lần, khoảng 5 phút

1. Đăng nhập Gmail **tqmai1996@gmail.com**, mở <https://script.google.com> và bấm **New project**. Đặt tên dự án là `Thư viện Yumi`.
   Đây là một dự án **riêng**, không dán chung với `BTVN` hay `Speaking`.
2. Xóa code mẫu, dán toàn bộ [`apps-script/Library.gs`](../apps-script/Library.gs) vào, rồi bấm 💾 **Save**.
3. Chọn hàm **`setup`** rồi bấm **▶ Run**. Google sẽ hỏi quyền: bấm **Review permissions → Advanced → Go to Thư viện Yumi (unsafe) → Allow**.
   Hộp thư sẽ nhận email **"Thư viện Yumi: cài đặt thành công ✅"**. Email có link thư mục Drive, link Sheet và **mã truy cập** (dạng `yumi-k7m2p`).
4. Bấm **Deploy → New deployment →** ⚙ **Web app**, rồi chọn:
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`. Bắt buộc chọn mục này để trang gọi được máy chủ. Người ngoài không có mã truy cập thì vẫn không xem được gì.
   - Bấm **Deploy** rồi **copy Web app URL**. URL kết thúc bằng `/exec`.
5. Mở [`library/app.js`](app.js) và sửa dòng 5:
   ```js
   const SCRIPT_URL = 'PASTE_APPS_SCRIPT_URL_HERE';
   ```
   Thay bằng URL vừa copy, giữ nguyên dấu nháy.

> **Đổi mã truy cập:** trong Apps Script, vào ⚙ **Project Settings → Script Properties**, sửa giá trị `ACCESS_CODE` rồi **Save**. Ai đang dùng mã cũ sẽ bị đưa về màn hình nhập mã.
>
> **Sửa `Library.gs` sau này:** vào **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. URL không đổi.

## B. Đăng trang

Push thư mục `d:\Syllabus` lên GitHub như các trang bài tập khác. Sau 1–2 phút trang sẽ có ở địa chỉ:
**<https://miathoday.github.io/grammar-homework/library/>**

Trang này **không** có link trong mục lục bài tập của học sinh, nên học sinh không thấy.
Gửi **link + mã truy cập** cho trợ lý qua Zalo. Lần đầu vào, mỗi người nhập mã và chọn **Cô** hoặc **Trợ lý**. Máy sẽ nhớ cho các lần sau.

---

## Cách dùng

- **Thêm bài:**
  - Bấm nút **＋ Thêm** góc dưới, hoặc **＋ Thêm** trong từng pack. Chọn 📄 File, 🔗 Link hoặc 📝 Ghi chú.
  - **Kéo thả file thẳng vào một cột pack** để tải lên nhanh. Có thể chọn nhiều file cùng lúc.
  - Mỗi file tối đa **20MB**. File lớn hơn, ví dụ video, thì tải lên Drive trước rồi dán link.
- **Xem nhanh:**
  - Mỗi bài chỉ hiện một dòng. Bấm vào **tên bài** để mở file, bấm vào **chỗ khác trên dòng** để xem mô tả, tag và ảnh.
  - Mỗi pack hiện 8 bài mới nhất, các bài còn lại nằm trong **▾ Xem thêm**.
  - Nút **▾ Mở hết** ở trên cùng mở tất cả các bài ra. Bấm lần nữa để thu gọn lại.
- **Tìm lại:**
  - Gõ vào ô tìm kiếm, **gõ không dấu cũng được** ("bai tap" vẫn tìm ra "Bài tập").
  - Gõ `#listening` để lọc theo tag, hoặc bấm vào một tag để lọc ngay.
  - Các chip phía trên lọc theo loại (Tài liệu, Ảnh, Audio, Link, Ghi chú) và theo người đăng.
- **Ghim 📌:** bài ghim luôn nằm đầu pack. Bật bằng cách bấm ✏️ **Sửa** rồi tick **Ghim**.
- **Chuyển pack, sửa, xóa:** bấm ✏️ **Sửa** trên bài. Khi chuyển pack, file trong Drive cũng được chuyển sang thư mục mới.
- **Pack:**
  - Bấm **⋯** trên đầu cột để đổi tên, emoji, màu hoặc dời thứ tự.
  - Chỉ xóa được pack khi pack đã trống.
- **Cập nhật:** khi một người đăng bài, người kia bấm 🔄 để thấy. Trang cũng tự tải lại khi quay lại tab sau hơn 1 phút.

## Lưu ý

- Ai có **link của một file** đều mở được file đó, giống Padlet. Vì vậy **không** đưa thông tin học phí hay dữ liệu nhạy cảm vào thư viện.
- File nằm trong Drive của cô nên dùng chung **15GB miễn phí** của tài khoản Google.
