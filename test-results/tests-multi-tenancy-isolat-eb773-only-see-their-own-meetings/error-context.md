# Page snapshot

```yaml
- generic [ref=e5]:
  - generic [ref=e6]:
    - heading "Chào mừng trở lại" [level=2] [ref=e7]
    - paragraph [ref=e8]: Đăng nhập để tiếp tục sử dụng
  - generic [ref=e9]:
    - generic [ref=e10]: Invalid login credentials
    - generic [ref=e12]:
      - text: Email
      - textbox "Email" [ref=e13]:
        - /placeholder: your.email@example.com
        - text: lma.testuser@gmail.com
    - generic [ref=e15]:
      - text: Mật khẩu
      - textbox "Mật khẩu" [ref=e16]:
        - /placeholder: ••••••••
        - text: test123456
    - button "Đăng nhập" [ref=e17] [cursor=pointer]
  - generic [ref=e18]:
    - paragraph [ref=e19]: Chưa có tài khoản?
    - link "Đăng ký ngay" [ref=e20] [cursor=pointer]:
      - /url: "#/register"
```