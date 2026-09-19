# MAS Backend

一个使用 Bun、TypeScript、Fastify、Drizzle ORM 和 PostgreSQL 的后端脚手架，附带基于 mas-cms 的 React 管理后台。

默认提供后台账号与角色、前台用户注册登录、权限管理、接口文档与调试、数据库工作台、运行日志和操作审计。目前仅支持 PostgreSQL；鉴权与权限判断由应用执行，不使用 PostgREST 或 PostgreSQL RLS 授权体系。

首次使用按本文启动；开发前阅读 [全仓库规范](AGENTS.md)，修改后台页面时再阅读 [前端规范](apps/web-cms/AGENTS.md)。

## 快速启动

环境要求：Bun 1.3.13 或以上，以及可连接的 PostgreSQL（项目已在 PostgreSQL 18 上验证）。以下命令均在项目根目录执行。

```bash
bun install --frozen-lockfile
cp .env.example .env
```

编辑 `.env` 的 `DATABASE_URL`，指向**已经创建**的开发数据库。迁移创建表，不负责创建数据库。保留已有 `.env` 时不要重新复制覆盖。

```bash
bun run db:migrate
bun run dev
```

- 后台页面：<http://127.0.0.1:5173/>
- 后端地址：<http://127.0.0.1:9811>
- 健康检查：`GET /api/health`，会实际检查数据库连接。
- 默认超管：`admin / 123456`，用于本地开发；对外部署前设置自己的初始密码。

首次启动仅在数据库**没有超管**时使用 `ADMIN_ACCOUNT` / `ADMIN_PASSWORD`，已有账号不会被覆盖。首次缺少有效初始化配置会启动失败；初始化后可以移除这两项。初始超管密码允许 6–128 位，普通账号创建、注册和密码修改要求 12–128 位。

### 可选：用 Docker 启动开发数据库

本机没有 PostgreSQL 时，可以使用仓库的 Compose 示例；需要先安装并启动 Docker，且本机 5432 端口未被占用。

```bash
docker compose -f deploy/compose.yaml up -d
```

默认 Compose 数据库连接是：

```dotenv
DATABASE_URL=postgresql://mas:mas_dev_password@127.0.0.1:5432/mas_backend
```

将它写入 `.env` 后执行上述迁移和启动命令。如果设置了 `POSTGRES_PASSWORD`，使用实际密码；已有 Docker 数据卷不会因改环境变量自动修改数据库账号密码。

## 项目结构

```text
app.config.ts                      # 当前业务入口、业务 schema 入口
config/permissions.ts              # 后台与前台权限声明
apps/app_server/src/
  app.ts                           # 注入权限目录、注册业务模块
  main.ts                          # 调用系统启动器
  database/schema/users.ts         # 前台用户、角色关联、会话表
  modules/users/                   # 前台认证和后台用户管理接口
apps/web-cms/src/                   # 管理后台，不是面向普通用户的网站
system/server/src/
  runtime/                         # 创建应用、启动与关闭、错误提示
  modules/                         # 后台认证、角色、日志、调试、数据库管理
  database/schema/system.ts        # 系统表
  plugins/                         # 安全、静态资源等公共能力
database/
  schema.ts                        # 系统表导出
  migrations/                      # SQL、快照与生成记录
  migrate.ts                       # 执行迁移
scripts/                           # 开发、构建、数据库重置等脚本
deploy/                            # 部署配置示例
```

业务代码放 `apps/app_server`，可复用系统能力放 `system/server`。系统不反向导入业务应用或根目录权限配置。

`app.config.ts` 集中配置 `serverEntry` 和 `businessSchema`，启动、构建及 Drizzle 使用同一份配置。业务表增多后可用一个入口文件统一导出；切换应用时同步维护业务测试，审查生成迁移，避免意外删除原业务表。

`public/`、`runtime/`、`backups/`、`backup/` 是 Git 忽略的本地目录。迁移文件和根目录 `bun.lock` 必须提交。

## 认证、角色和权限

| 对象     | 账号 / 会话表                     | 角色归属 | 权限目录           |
| -------- | --------------------------------- | -------- | ------------------ |
| 后台用户 | `sys_admins` / `sys_sessions`     | `admin`  | `adminPermissions` |
| 前台用户 | `app_users` / `app_user_sessions` | `app`    | `appPermissions`   |

两类角色在「系统管理 → 权限管理 → 角色与权限」分开管理，归属创建后不可更改。用户只能绑定对应类型的角色，角色只能选择对应目录的权限；同一权限 code 不可跨目录重复。

后台“管理前台用户”属于后台权限。前台业务权限默认为空，新注册用户无角色，但可以登录和维护自己的基本资料。后台超管是独立身份，不能通过角色授予；后台 token 也不能直接当作前台 token 使用。

- 前台认证：`POST /api/app/auth/register`、`POST /api/app/auth/login`、`POST /api/app/auth/logout`、`GET/PUT /api/app/auth/me`、`POST /api/app/auth/password`。
- 后台用户管理：`GET/POST /api/admin/app-users`、`GET/PUT /api/admin/app-users/:id`，以及 `POST /api/admin/app-users/:id/status`、`/password`、`/revoke`。
- 前台本人资料只允许修改昵称和头像；`metadata` 是后台维护的 JSONB 对象，用户只能读取自己的额外资料。不用它存授权依据或秘密；需要索引、排序、唯一约束的字段应单独建列。
- 停用、重置密码、修改本人密码、强制下线会撤销该用户全部会话；退出登录撤销当前会话。管理操作写入审计。

数据库只保存令牌哈希。Bearer 模式通过 `Authorization: Bearer <token>` 传递；Cookie 模式由服务端设置 HttpOnly Cookie，写请求同时校验来源和 `X-CSRF-Token`。两类 Cookie 分别为 `mas_session`、`mas_app_session`，切换认证传递方式需重启并重新登录。

## 配置与部署

配置项、默认值、枚举和范围以 [.env.example](.env.example) 为准，实际校验在 [env.ts](system/server/src/config/env.ts)。

| 场景            | 配置关系                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 修改后端端口    | 同时修改 `PORT` 与 Vite 的 `API_PROXY_TARGET`                                                                              |
| 开发后台        | Vite 提供 5173 页面，只代理 `/api`；不使用 `WEB_CMS_PATH`                                                                  |
| Cookie 来源校验 | `PUBLIC_ORIGIN` 填浏览器来源，例如 `http://127.0.0.1:5173`，不带路径；它不是 CORS 白名单，前台 Cookie 写请求也使用这一来源 |
| 跨域请求        | `CORS_ORIGINS` 是显式来源白名单；使用 Vite 代理或同源部署时通常留空                                                        |
| 预发 / 正式     | `APP_ENV=staging` / `production`，后端自动挂载构建后的后台，默认 `/web-cms/`                                               |
| 后台路径        | `WEB_CMS_PATH` 在部署环境生效；修改后重启后端，无需重新构建前端                                                            |
| 公开文件        | `STATIC_DIR=public` 存文件，`STATIC_PATH=/public` 是 URL 前缀；无需登录，不提供上传接口                                    |

例如 `public/images/logo.png` 可从后端 `/public/images/logo.png` 读取。目录启动时自动创建；隐藏文件、目录外文件和目录列表不可访问。更改静态目录后自行维护 Git 忽略与文件备份。

部署前配置实际数据库、来源和初始超管密码；Cookie 正式环境要求 HTTPS。默认 `HOST=127.0.0.1`，容器或远程访问需要显式设置监听地址。

```bash
bun install --frozen-lockfile
bun run db:migrate
bun run build
APP_ENV=production bun run start
```

构建输出统一位于根目录 `dist/`：`dist/server/main.js` 是压缩后的后端代码，`dist/server/main.js.map` 用于错误定位，`dist/web-cms/` 是后台静态页面。后端运行依赖一起打入 `main.js`，部署无需 `node_modules` 或执行 `bun install`，仍需安装 Bun。构建生成 `dist/.env.example`，并清理旧构建的部署依赖清单和锁文件。根地址 `/` 不自动跳转到后台，默认返回 404；显式将 `WEB_CMS_PATH=/` 配置为后台入口时除外。`WEB_CMS_DIST` 可覆盖后台构建目录。Vite mode 不决定后端运行环境。

也可以只上传整个 `dist/`，在部署服务器安装 Bun 后执行：

```bash
cd dist
cp .env.example .env
# 编辑 .env，配置数据库、访问来源、监听地址和初始超管密码
bun server/main.js
```

已有 `.env` 时不要覆盖。部署模板默认 `APP_ENV=production`、`WEB_CMS_DIST=web-cms`；静态文件放部署目录的 `public/`，启动时自动创建。构建不会复制或覆盖实际 `.env`、`public/` 和运行数据。不需要上传源码 workspace 或安装前端构建依赖。

数据库须提前创建，并在源码项目执行 `bun run db:migrate` 升级到本次版本；部署包不包含迁移工具，启动不会自动迁移。根目录启动仍使用原来的 `bun run start`，其 `.env` 不要套用部署包的 `WEB_CMS_DIST`。

接口调试位于「系统管理 → 开发工具」，接口目录来自路由生成的 OpenAPI。查看需要 `api:read`，发送调试请求需要 `api:debug`，目标接口仍检查自己的权限。正式环境默认关闭在线调试，可通过 `API_DEBUG_ENABLED` 配置。数据库工作台仅超管可访问，提供数据、结构和 SQL 执行；正式环境执行 SQL 需要确认环境。

## 开发一个业务功能

1. 在 `apps/app_server/src/database/schema/` 定义表，并从 `app.config.ts` 指向的 schema 入口导出。
2. 执行 `bun run db:generate`，审查 SQL，再执行 `bun run db:migrate`。
3. 在 `modules/<业务名>/` 定义接口，用系统已有连接和错误处理；在 `app.ts` 的 `register` 中注册。参考 [用户模块](apps/app_server/src/modules/users/index.ts)。
4. 在 [config/permissions.ts](config/permissions.ts) 对应目录声明新权限。后台接口用 `auth: true` 和 `permissions`；前台接口另声明 `authScope: "app"`，并校验资源归属。
5. 路由 Schema 写明中文分组、说明、输入约束、响应字段和示例，接口会自动进入调试页。
6. 后台页面放 `apps/web-cms/src/views/`，请求放 `src/http/services/`，菜单在 `src/router/` 注册；参考现有 AppUsers 页面，遵循 [前端规范](apps/web-cms/AGENTS.md)。
7. 完成下述检查；涉及权限、数据库或页面交互时增加相应验收。同步更新受影响的说明，不重新建立阶段规划文档。

## 常用命令与自测

| 命令                                         | 用途                                                          |
| -------------------------------------------- | ------------------------------------------------------------- |
| `bun run dev`                                | 一起启动后端监听与 Vite，任一退出会关闭另一进程               |
| `bun run dev:server` / `bun run dev:web-cms` | 单独启动后端 / 后台前端                                       |
| `bun run db:generate`                        | 比较代码 schema 与迁移快照，生成 SQL，不修改数据库            |
| `bun run db:migrate`                         | 应用尚未执行的迁移，通过数据库中的迁移记录避免重复执行        |
| `bun run db:sync`                            | 依次 generate、migrate，适合本地开发；需先审查 SQL 时分开执行 |
| `bun run db:reset`                           | 备份后双重确认清库，并删除迁移目录                            |
| `bun run check`                              | 后端和前端类型检查、根格式检查、Bun 测试                      |
| `bun run format` / `bun run format:check`    | 按根目录格式范围执行修复 / 检查                               |
| `bun run --cwd apps/web-cms lint`            | 前端 ESLint，未包含在根 check 中                              |
| `bun run --cwd apps/web-cms test`            | 前端 Vitest，未包含在根 check 中                              |
| `bun run test:integration`                   | 真实 PostgreSQL 集成测试，需设置测试库连接                    |
| `bun run build` / `bun run start`            | 构建前后端 / 启动构建产物                                     |

`bun run check` 没有数据库配置时会跳过集成测试，不代表数据库验收通过。集成测试使用**独立的、名称以 `_test` 结尾的空数据库**，不要与开发服务、浏览器验收或正式库共用；测试会修改账号、切换会话模式，首次超管测试要求初始没有超管。

```bash
# 先创建 mas_backend_test 数据库；替换实际连接信息
TEST_DATABASE_URL=postgresql://user:password@127.0.0.1:5432/mas_backend_test bun run test:integration
```

浏览器回归使用另一个独立测试库，先迁移，再构建并运行：

```bash
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/mas_browser_test bun run db:migrate
bun run build
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/mas_browser_test AUTH_TRANSPORT=bearer ADMIN_ACCOUNT=admin ADMIN_PASSWORD=123456 bun run --cwd apps/web-cms test:e2e:debug
```

需要 Playwright 可使用本机 Chrome。配置自动启动 8782 端口；当前前台用户浏览器用例按默认 `admin / 123456` 验收。`test:e2e` 是保留的上游演示测试，不作为当前管理后台回归入口。

运行时退出逻辑发生变化时，可另执行 `RUNTIME_PROCESS_TEST=true bun test tests/runtime-process.test.ts`，使用临时端口验证进程退出和资源清理。

## 数据库迁移与重置

`database/migrations/` 不是数据备份：SQL 表示结构变更，`meta` 保存生成所需快照和顺序，数据库中的 `drizzle.__drizzle_migrations` 记录已执行迁移。已有库升级应新增迁移，不能随意删除历史文件或迁移记录；有数据的库也不能当成空库重新跑建表迁移。

只有明确希望从零开始时才执行 `bun run db:reset`。它不按 `APP_ENV` 限制，目标取自 `DATABASE_URL`：

1. 停止项目服务及其他写入程序，在交互终端输入目标数据库名。
2. 脚本用 `pg_dump` 完整备份单库并备份迁移目录，检查归档可读取；失败不清库。
3. 再输入 `RESET`，删除并重建数据库，删除迁移目录；有其他连接时拒绝重置。
4. 执行 `bun run db:sync`、`bun run dev`，重新生成结构和初始化超管。

备份保存在 Git 忽略的 `backups/`，包括 `database.dump`、迁移副本和 `manifest.json`，不自动清理。需安装匹配服务端版本的 `pg_dump` / `pg_restore`，也可通过 `PG_BIN` 指定工具目录。单库备份不包含实例级角色定义；可读取检查不等于恢复演练。

恢复时停止写入并核实目标，用 `pg_restore --clean --if-exists --create --dbname=<维护库连接> <备份目录>/database.dump` 恢复同名库，同时恢复对应的 `migrations/`。这是覆盖操作；密码使用 PostgreSQL 密码文件等方式提供，不放进命令参数。重置中途失败先查看备份的 `manifest.json`，不要盲目重跑。

## 常见问题

- **缺少数据库表 / 42P01**：首次拉取执行 `bun run db:migrate`；重置后迁移目录为空时执行 `bun run db:sync`。
- **修改 ADMIN_PASSWORD 没生效**：初始化配置不会覆盖已有超管，需通过账号密码功能修改。
- **预发或正式环境提示后台产物缺失**：先运行 `bun run build`；开发环境使用 5173。
- **Cookie 写请求 403**：检查 `PUBLIC_ORIGIN`、浏览器实际来源和 `X-CSRF-Token`，不要用 CORS 白名单替代来源校验。
- **测试通过但数据库功能不确定**：检查测试输出是否 skipped，并在独立测试库运行集成测试。

后台上游来源见 [UPSTREAM.md](apps/web-cms/UPSTREAM.md)。组件自身的使用说明保留在组件目录，开发约定统一由本仓库的 AGENTS.md 维护。
