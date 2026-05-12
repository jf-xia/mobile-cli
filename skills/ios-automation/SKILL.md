---
name: ios-automation
description: "在 VS Code 中执行 iOS 真机与模拟器自动化。用于设备巡检、应用安装启动、界面元素读取、点击输入、截图、录屏、崩溃查看与 iOS 远程设备申请。适用于 go-ios、WebDriverAgent、mobilecli 场景。"
argument-hint: "描述 iOS 自动化任务，例如：列出设备、安装 IPA、截图、查看页面元素、开始录屏"
user-invocable: true
---

# iOS 自动化技能

## 适用场景

- 需要列出当前可用的 iOS 真机或模拟器。
- 需要安装、启动、终止、卸载 iOS 应用。
- 需要读取当前页面元素、执行点击、双击、长按、输入、滑动、按键、打开链接。
- 需要保存截图、开始或停止录屏、读取 crash 信息。
- 需要通过 skill 中自带脚本直接执行 iOS 自动化，不依赖仓库外部源码。

## 运行入口

直接执行 skill 自带 TS 脚本：

```bash
./scripts/ios-automation.ts doctor
./scripts/ios-automation.ts devices:list
```

脚本启动时会先检查 `mobilecli`。如果未安装，会自动执行：

```bash
npm install -g mobilecli@latest
```

真机自动化会优先使用本地 WebDriverAgent。默认从 `~/work/WebDriverAgent` 启动；如需自定义路径，可设置 `IOS_WDA_PATH`。WDA 启动等待时间可通过 `IOS_WDA_START_TIMEOUT` 调整，单位毫秒。

## 快速开始（真机）

对于 iOS 17+ 真机，首次使用需要环境配置。推荐流程：

```bash
# 1. 一键配置环境（自动启动 tunnel 和端口转发）
./scripts/ios-automation.ts setup --device <device-id>

# 2. 如果需要 WDA 交互（点击、输入等），加上 --wda 参数
./scripts/ios-automation.ts setup --device <device-id> --wda

# 3. 确认设备就绪
./scripts/ios-automation.ts doctor
./scripts/ios-automation.ts devices:list

# 4. 开始自动化操作
./scripts/ios-automation.ts apps:launch --device <device-id> --package com.apple.mobilenotes
./scripts/ios-automation.ts screen:elements --device <device-id>
```

## 推荐流程

1. 先运行 `doctor` 和 `devices:list`。
2. 选定真机或模拟器设备 ID。
3. 对于真机（iOS 17+），运行 `setup` 配置环境。
4. 再运行应用管理或屏幕交互命令。
5. 对截图、录屏等产物指定输出路径。

## 常用命令

```bash
# 诊断与环境
./scripts/ios-automation.ts doctor
./scripts/ios-automation.ts devices:list
./scripts/ios-automation.ts setup --device <device-id>        # 一键配置 tunnel + 端口转发
./scripts/ios-automation.ts setup --device <device-id> --wda  # 配置并启动 WDA

# Tunnel 管理
./scripts/ios-automation.ts tunnel:start
./scripts/ios-automation.ts tunnel:stop
./scripts/ios-automation.ts tunnel:status

# 端口转发管理
./scripts/ios-automation.ts forward:start --device <device-id>
./scripts/ios-automation.ts forward:stop

# WDA 管理
./scripts/ios-automation.ts wda:start --device <device-id>

# 应用管理
./scripts/ios-automation.ts apps:list --device <device-id>
./scripts/ios-automation.ts apps:launch --device <device-id> --package <bundle-id>
./scripts/ios-automation.ts apps:terminate --device <device-id> --package <bundle-id>
./scripts/ios-automation.ts apps:install --device <device-id> --path ./MyApp.ipa

# 屏幕交互
./scripts/ios-automation.ts screen:size --device <device-id>
./scripts/ios-automation.ts screen:elements --device <device-id>
./scripts/ios-automation.ts screen:tap --device <device-id> --x <x> --y <y>
./scripts/ios-automation.ts screen:type --device <device-id> --text "hello"
./scripts/ios-automation.ts screen:screenshot --device <device-id> --output ./tmp/ios-screen.png
./scripts/ios-automation.ts screen:record-start --device <device-id> --output ./tmp/ios.mp4
./scripts/ios-automation.ts screen:record-stop --device <device-id>
```

更多命令见 [命令参考](./references/command-reference.md)。限制说明见 [限制说明](./references/limitations.md)。故障排除见 [故障排除](./references/troubleshooting.md)。

## 常见问题

### 真机 `devices:list` 看不到设备

iOS 17+ 设备需要 tunnel 才能通信。运行以下命令：

```bash
./scripts/ios-automation.ts tunnel:start
./scripts/ios-automation.ts devices:list
```

### `screen:elements` 报错 "Port forwarding to WebDriverAgent is not running"

需要设置端口转发并启动 WDA：

```bash
./scripts/ios-automation.ts forward:start --device <device-id>
./scripts/ios-automation.ts wda:start --device <device-id>
# 等待 30-60 秒让 WDA 启动完成
./scripts/ios-automation.ts screen:elements --device <device-id>
```

### 一键配置所有环境

```bash
./scripts/ios-automation.ts setup --device <device-id> --wda
```
