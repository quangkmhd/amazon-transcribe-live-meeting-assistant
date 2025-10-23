# Page snapshot

```yaml
- generic [ref=e5]:
  - generic [ref=e6]:
    - heading "Chào mừng trở lại" [level=2] [ref=e7]
    - paragraph [ref=e8]: Đăng nhập để tiếp tục sử dụng
  - generic [ref=e9]:
    - generic [ref=e11]:
      - text: Email
      - textbox "Email" [ref=e12]:
        - /placeholder: your.email@example.com
    - generic [ref=e14]:
      - text: Mật khẩu
      - textbox "Mật khẩu" [ref=e15]:
        - /placeholder: ••••••••
    - button "Đăng nhập" [ref=e16] [cursor=pointer]
  - generic [ref=e17]:
    - paragraph [ref=e18]: Chưa có tài khoản?
    - link "Đăng ký ngay" [ref=e19] [cursor=pointer]:
      - /url: "#/register"
```