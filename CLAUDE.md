# Port Manager — Claude 协作规范

## 文档语言

所有由 superpowers、skills 或 Claude 生成的文档（spec、plan、设计文档、注释文档等）**必须使用中文**。代码、变量名、commit message 保持英文。

## 功能完成后必须更新

每完成一个功能模块后，同步更新本文件中的以下两个部分：
1. **技术架构**
2. **项目启动命令**

有任何结构变动（新增模块、依赖变更、目录调整）立即同步，不得滞后。

---

## 技术架构

```
port-manager/
├── src-tauri/
│   ├── src/
│   │   ├── commands/
│   │   │   └── ports.rs        # list_ports、kill_port Tauri 命令 + 单元测试
│   │   └── lib.rs              # 注册 Tauri 命令
│   └── Cargo.toml              # 依赖：netstat2、sysinfo、serde
├── src/
│   ├── components/
│   │   ├── PortTable.tsx       # 端口列表表格（shadcn Table）
│   │   ├── KillDialog.tsx      # Kill 确认弹窗（shadcn AlertDialog）
│   │   └── RefreshBar.tsx      # 自动刷新开关 + 手动刷新按钮
│   ├── hooks/
│   │   └── usePorts.ts         # TanStack Query 轮询 hook
│   ├── types/
│   │   └── port.ts             # PortEntry 接口定义
│   ├── test/
│   │   ├── PortTable.test.tsx  # vitest 组件测试
│   │   └── setup.ts            # @testing-library/jest-dom 初始化
│   ├── App.tsx                 # 根组件：布局、状态、kill 逻辑
│   └── main.tsx                # QueryClientProvider 入口
└── CLAUDE.md                   # 本文件
```

### 数据流

```
Rust list_ports
  └─ netstat2 读取系统 socket 表
  └─ sysinfo 解析 PID → 进程名
      ↓
Frontend usePorts (TanStack Query, 3s 轮询)
      ↓
PortTable 展示 → Kill 按钮
      ↓
KillDialog 确认 → invoke kill_port(pid)
      ↓
Toast 提示 → 刷新列表
```

### 核心依赖

| 层级 | 依赖 |
|------|------|
| Rust | netstat2 0.2, sysinfo 0.30, serde 1 |
| 前端框架 | React 19, TypeScript, Vite 7 |
| UI | TailwindCSS, shadcn/ui, lucide-react |
| 状态 | TanStack Query v5 |
| 测试 | vitest, @testing-library/react |
| 桌面 | Tauri 2.x |

---

## 项目启动命令

```bash
# 进入项目目录
cd /Users/pciswork/mywork/AI/my-tools/port-manager

# 安装前端依赖（首次）
npm install

# 开发模式（热更新）
npm run tauri dev

# 前端单元测试
npm run test -- --run

# Rust 单元测试
cd src-tauri && cargo test

# 生产构建
npm run tauri build
```

---

## 扩展规范

- 新功能模块在 `src-tauri/src/commands/` 下新建文件，不改现有文件
- 前端新功能组件放 `src/components/`，hook 放 `src/hooks/`
- 左侧 sidebar 导航预留给后期功能集成（参考 cc-switch 布局）
