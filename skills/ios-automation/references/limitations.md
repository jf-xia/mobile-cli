# iOS 技能限制说明

## 通用限制

- 该 skill 以脚本为执行核心，不再提供 MCP tool schema。
- 截图通过文件路径返回，不直接返回协议级图片内容。
- 录屏依赖本地状态文件保存 PID 和输出路径。
- 模拟器、录屏和 crash 依赖 `mobilecli`。

## 真机自动化要求（iOS 17+）

iOS 17 及以上版本的真机自动化需要三个组件同时就绪：

1. **go-ios tunnel**：用于与 iOS 17+ 设备建立通信隧道。
   - 使用 `--userspace` 模式运行，不需要 sudo。
   - 默认监听端口 60105，可通过 `IOS_AUTOMATION_TUNNEL_PORT` 覆盖。
   - 端口可能被之前的进程占用，需要先清理。

2. **端口转发**：将本地 WDA 端口转发到设备上的 WDA 端口。
   - 默认转发 localhost:8100 → device:8100。
   - WDA 端口可通过 `IOS_AUTOMATION_WDA_PORT` 覆盖。

3. **WebDriverAgent (WDA)**：用于 UI 交互（点击、输入、获取元素等）。
   - 需要 Xcode 和 WebDriverAgent 项目。
   - 默认从 `~/work/WebDriverAgent` 启动；可通过 `IOS_WDA_PATH` 覆盖。
   - WDA 首次启动需要通过 xcodebuild 编译并安装到设备，约 30-60 秒。

### 一键配置

```bash
# 配置 tunnel + 端口转发
./scripts/ios-automation.ts setup --device <device-id>

# 配置 tunnel + 端口转发 + 启动 WDA
./scripts/ios-automation.ts setup --device <device-id> --wda
```

### 不需要 WDA 的命令

以下命令在有 tunnel 的情况下即可使用（无需 WDA）：

- `devices:list`
- `apps:list`
- `apps:launch`
- `apps:terminate`
- `apps:install`
- `apps:uninstall`
- `crashes:list`
- `crashes:get`

### 需要 WDA 的命令

以下命令需要 tunnel + 端口转发 + WDA 全部就绪：

- `screen:elements`
- `screen:tap`、`screen:double-tap`、`screen:long-press`
- `screen:type`
- `screen:swipe`
- `screen:button`
- `screen:open-url`
- `screen:screenshot`
- `screen:size`
- `orientation:get`、`orientation:set`

## 已知问题

- **USB 断开重连后 tunnel 需要重启**：设备 USB 断开后，go-ios 的 tunnel 可能仍在运行但已失效。需要先 `tunnel:stop` 再 `tunnel:start`。
- **WDA 进程崩溃**：长时间运行后 WDA 可能退出。需要重新运行 `wda:start`。
- **端口冲突**：之前的自动化进程可能占用端口，新进程启动时会自动清理旧进程。
