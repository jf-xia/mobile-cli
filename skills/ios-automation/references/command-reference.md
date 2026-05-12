# iOS 命令参考

统一入口：

```bash
../scripts/ios-automation.ts <command> [options]
```

## 诊断与环境

- `doctor` — 检查依赖和环境状态
- `devices:list` — 列出所有可用的 iOS 真机和模拟器
- `setup --device <device-id> [--wda]` — 一键配置环境（tunnel + 端口转发，可选 WDA）

## Tunnel 管理（iOS 17+ 必需）

- `tunnel:start` — 启动 go-ios tunnel（使用 userspace 模式，无需 sudo）
- `tunnel:stop` — 停止 tunnel
- `tunnel:status` — 查看 tunnel 和端口转发状态

## 端口转发管理

- `forward:start --device <device-id>` — 设置本地端口到设备 WDA 端口的转发
- `forward:stop` — 停止端口转发

## WDA 管理

- `wda:start --device <device-id>` — 通过 xcodebuild 构建并启动 WebDriverAgent

## 应用管理

- `apps:list --device <device-id>` — 列出已安装应用
- `apps:launch --device <device-id> --package <bundle-id> [--locale zh-CN,en-US]` — 启动应用
- `apps:terminate --device <device-id> --package <bundle-id>` — 终止应用
- `apps:install --device <device-id> --path <ipa|app|zip-path>` — 安装应用
- `apps:uninstall --device <device-id> --bundle-id <bundle-id>` — 卸载应用

## 屏幕与交互

- `screen:size --device <device-id>` — 获取屏幕尺寸
- `screen:tap --device <device-id> --x <x> --y <y>` — 点击
- `screen:double-tap --device <device-id> --x <x> --y <y>` — 双击
- `screen:long-press --device <device-id> --x <x> --y <y> [--duration 800]` — 长按
- `screen:elements --device <device-id>` — 获取屏幕元素
- `screen:button --device <device-id> --button HOME|ENTER|VOLUME_UP|VOLUME_DOWN` — 按键
- `screen:open-url --device <device-id> --url https://example.com` — 打开链接
- `screen:swipe --device <device-id> --direction up|down|left|right [--x 200 --y 500 --distance 300]` — 滑动
- `screen:type --device <device-id> --text "hello" [--submit]` — 输入文字
- `screen:screenshot --device <device-id> [--output ./tmp/ios.png]` — 截图

## 方向、录屏与崩溃

- `orientation:get --device <device-id>` — 获取屏幕方向
- `orientation:set --device <device-id> --orientation portrait|landscape` — 设置屏幕方向
- `screen:record-start --device <device-id> [--output ./tmp/demo.mp4] [--time-limit 30]` — 开始录屏
- `screen:record-stop --device <device-id>` — 停止录屏
- `crashes:list --device <device-id>` — 列出崩溃报告
- `crashes:get --device <device-id> --id <crash-id>` — 获取崩溃详情

## 远程设备

- `remote:list` — 列出远程设备
- `remote:allocate` — 申请远程设备
- `remote:release --device <device-id>` — 释放远程设备

## 输出格式

- 成功：`{ "status": "ok", "data": ... }`
- 失败：`{ "status": "error", "error": { "message": "..." } }`
