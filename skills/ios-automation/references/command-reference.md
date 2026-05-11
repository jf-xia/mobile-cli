# iOS 命令参考

统一入口：

```bash
../scripts/ios-automation.ts <command> [options]
```

## 诊断与设备

- `doctor`
- `devices:list`
- `remote:list`
- `remote:allocate`
- `remote:release --device <device-id>`

## 应用管理

- `apps:list --device <device-id>`
- `apps:launch --device <device-id> --package <bundle-id> [--locale zh-CN,en-US]`
- `apps:terminate --device <device-id> --package <bundle-id>`
- `apps:install --device <device-id> --path <ipa|app|zip-path>`
- `apps:uninstall --device <device-id> --bundle-id <bundle-id>`

## 屏幕与交互

- `screen:size --device <device-id>`
- `screen:tap --device <device-id> --x <x> --y <y>`
- `screen:double-tap --device <device-id> --x <x> --y <y>`
- `screen:long-press --device <device-id> --x <x> --y <y> [--duration 800]`
- `screen:elements --device <device-id>`
- `screen:button --device <device-id> --button HOME|ENTER|VOLUME_UP|VOLUME_DOWN`
- `screen:open-url --device <device-id> --url https://example.com`
- `screen:swipe --device <device-id> --direction up|down|left|right [--x 200 --y 500 --distance 300]`
- `screen:type --device <device-id> --text "hello" [--submit]`
- `screen:screenshot --device <device-id> [--output ./tmp/ios.png]`

## 方向、录屏与崩溃

- `orientation:get --device <device-id>`
- `orientation:set --device <device-id> --orientation portrait|landscape`
- `screen:record-start --device <device-id> [--output ./tmp/demo.mp4] [--time-limit 30]`
- `screen:record-stop --device <device-id>`
- `crashes:list --device <device-id>`
- `crashes:get --device <device-id> --id <crash-id>`

## 输出格式

- 成功：`{ "status": "ok", "data": ... }`
- 失败：`{ "status": "error", "error": { "message": "..." } }`
