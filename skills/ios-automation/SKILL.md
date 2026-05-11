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

## 推荐流程

1. 先运行 `doctor` 和 `devices:list`。
2. 选定真机或模拟器设备 ID。
3. 再运行应用管理或屏幕交互命令。
4. 对截图、录屏等产物指定输出路径。

## 常用命令

```bash
./scripts/ios-automation.ts doctor
./scripts/ios-automation.ts devices:list
./scripts/ios-automation.ts apps:list --device <device-id>
./scripts/ios-automation.ts apps:install --device <device-id> --path ./MyApp.ipa
./scripts/ios-automation.ts screen:size --device <device-id>
./scripts/ios-automation.ts screen:screenshot --device <device-id> --output ./tmp/ios-screen.png
./scripts/ios-automation.ts screen:record-start --device <device-id> --output ./tmp/ios.mp4
./scripts/ios-automation.ts screen:record-stop --device <device-id>
```

更多命令见 [命令参考](./references/command-reference.md)。限制说明见 [限制说明](./references/limitations.md)。
