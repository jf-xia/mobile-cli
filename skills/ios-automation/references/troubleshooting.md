# iOS 自动化故障排除

## 设备检测问题

### `devices:list` 返回空列表

**症状**：`devices:list` 只显示模拟器，不显示真机。

**原因**：iOS 17+ 设备需要 go-ios tunnel 才能通信。如果 tunnel 未运行，go-ios 无法检测到设备。

**解决**：
```bash
./scripts/ios-automation.ts tunnel:start
./scripts/ios-automation.ts devices:list
```

**注意**：`xcrun xctrace list devices` 可以直接看到 USB 连接的设备（不依赖 tunnel），可以用来确认设备是否物理连接。

### `tunnel:start` 失败 — 端口被占用

**症状**：`tunnel:start` 返回 `"Tunnel failed to start: address already in use"`。

**解决**：新版本脚本会自动清理占用端口的旧进程。如果仍失败，手动清理：
```bash
lsof -ti:60105 | xargs kill -9
./scripts/ios-automation.ts tunnel:start
```

### USB 断开重连后设备不可用

**症状**：USB 断开重连后，自动化命令报错或超时。

**解决**：
```bash
./scripts/ios-automation.ts tunnel:stop
./scripts/ios-automation.ts tunnel:start
./scripts/ios-automation.ts forward:start --device <device-id>
```

---

## WDA 问题

### `screen:elements` 报错 "Port forwarding to WebDriverAgent is not running"

**症状**：UI 交互命令报端口转发错误。

**解决**：
```bash
./scripts/ios-automation.ts forward:start --device <device-id>
./scripts/ios-automation.ts screen:elements --device <device-id>
```

### `screen:elements` 报错 "WebDriverAgent is not running on the device"

**症状**：端口转发正常，但 WDA 未在设备上运行。

**原因**：
- WDA 未安装到设备上
- WDA 已崩溃或被系统杀死

**解决**：
```bash
# 启动 WDA（通过 xcodebuild 编译安装）
./scripts/ios-automation.ts wda:start --device <device-id>
# 等待 30-60 秒
./scripts/ios-automation.ts screen:elements --device <device-id>
```

**前提条件**：
- 已安装 Xcode
- WebDriverAgent 项目在 `~/work/WebDriverAgent`（或通过 `IOS_WDA_PATH` 指定路径）
- 设备已配置开发者证书

### WDA 项目不存在

**症状**：`wda:start` 返回 `"WebDriverAgent project not found at ..."`。

**解决**：
```bash
# 克隆 WebDriverAgent
cd ~/work
git clone https://github.com/facebookarchive/WebDriverAgent.git

# 或设置自定义路径
export IOS_WDA_PATH=/path/to/WebDriverAgent
./scripts/ios-automation.ts wda:start --device <device-id>
```

### WDA 启动超时

**症状**：`wda:start` 后长时间无法使用 UI 交互命令。

**解决**：
1. 检查 Xcode 编译日志确认是否正在构建
2. 检查设备是否显示信任证书弹窗（需要在设备上点"信任"）
3. 增加超时时间：`export IOS_WDA_START_TIMEOUT=60000`

---

## 端口转发问题

### `forward:start` 后 WDA 仍然不可用

**症状**：端口转发已启动，但 `screen:elements` 仍然报错。

**原因**：端口转发只建立了本地到设备的网络通道，WDA 本身还需要在设备上运行。

**解决**：
```bash
./scripts/ios-automation.ts forward:start --device <device-id>
./scripts/ios-automation.ts wda:start --device <device-id>
# 等待 WDA 启动
./scripts/ios-automation.ts screen:elements --device <device-id>
```

---

## 一键修复

如果遇到复杂问题，尝试一键重置环境：

```bash
# 1. 停止所有服务
./scripts/ios-automation.ts tunnel:stop
./scripts/ios-automation.ts forward:stop

# 2. 重新配置
./scripts/ios-automation.ts setup --device <device-id> --wda

# 3. 验证
./scripts/ios-automation.ts tunnel:status
./scripts/ios-automation.ts screen:elements --device <device-id>
```
