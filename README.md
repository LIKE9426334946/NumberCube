# NumberCube

一个支持输入数组形状的数字矩阵可视化网页。输入 `3` 可生成一行方块，输入 `3,3` 可生成矩阵面，输入 `3,3,3` 可生成三维魔方，输入 `3,3,3,3` 可生成 3 个并排的 3×3×3 魔方。

## 功能

- 支持输入 1—4 维数组形状：`3`、`3,3`、`3,3,3`、`3,3,3,3`
- 依次生成一维方块行、二维矩阵面、三维魔方或多个三维魔方
- 每个维度支持 1—6，单元总数不超过 216
- 每个小方块显示对应的浮点数值
- `/control` 的“单元显示内容”可切换“显示数值 / 显示编号”，实时同步到展示页，不改变原始数据
- 编号按数组索引从 0 开始：一维 `x2`、二维 `x21`、三维 `x211`、四维 `x1211`；例如 `x211` 对应三维数组的 `(2, 1, 1)`
- 每个数组可独立设置编号前缀：在 `/control` 的数组列表中选中数组，填写“当前数组编号前缀”并点击“应用前缀”。例如 `x.json` 设为 `x`，`conv1.json` 设为 `w`，三维时分别显示 `x000`、`w000`，四维时显示 `x0000`、`w0000`
- 前缀支持 1—12 位字母、数字或下划线，以字母或下划线开头；保留大小写，默认 `x`。只影响编号显示，不改文件名、原始数据或切片位置；各数组的前缀会同步到展示页，并随场景保存、更新和恢复
- “高亮区域逐元素相乘”：先分别为两个原始数组设置切片高亮，再选择左右数组，点击“生成符号乘积”。仅允许切片结果形状完全一致（不广播、不只比较块数），按切片的行优先顺序配对
- 例如 `x.shape=(1,3,4,4)`、`w.shape=(2,3,2,2)`，选择 `x[0,:,0:2,0:2]` 与 `w[0]`，都得到 `(3,2,2)`，生成 12 个紫色结果块，显示 `x0000 × w0000` 至 `x0211 × w0211`。使用源数组的完整坐标，不重新编号；整数索引去掉该维，范围切片保留该维
- 符号结果是生成时的独立快照，可移动、隐藏、切片、删除，并随场景保存、更新、恢复。原始数组的数据、切片和位置不会被修改；修改源数组后需重新生成。结果始终显示符号（不计算数值、不支持符号结果继续相乘），最多仍为 8 个数组
- 选中符号结果可展开每项乘法及完整求和式，对应一次窗口的逐元素乘积之和（类似 PyTorch 卷积，不翻转卷积核、不含偏置），不自动滑动窗口或生成整个卷积输出
- 编号使用每个数组自身的索引，旋转、移动、隐藏和切片高亮不会重新编号；四维编号包含最前面的魔方索引
- 显示模式在刷新后保留，并随场景保存、更新和恢复；旧场景默认显示数值，“只显示左面”对编号同样有效
- 可分别隐藏 `a[0, :, :]`、`a[1, :, :]` 等矩阵面；第 1 面是重置视角后朝向左侧的竖直平面
- 四维形状会同时隐藏每个魔方中相同位置的矩阵面
- 隐藏后不显示数字和表面，只保留透明的空间边框
- 支持同时隐藏多个面，并可一键全部显示
- 支持拖动旋转、滚轮缩放、触摸操作和单元间距调整

## 本地开发

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm ci
npm run build
HOST=127.0.0.1 PORT=3011 node backend/server.js
```

`backend/server.js` 会同时处理服务端渲染和 `dist/client` 中的 CSS、JavaScript、字体等静态资源。

## Ubuntu 服务器部署

项目部署路径为 `/opt/NumberCube`，Node.js 监听 `127.0.0.1:3011`，Nginx 对外监听 `16011`。

```bash
git clone https://github.com/LIKE9426334946/NumberCube.git /opt/NumberCube
cd /opt/NumberCube
npm ci
npm run build

cp deploy/NumberCube.service /etc/systemd/system/NumberCube.service
cp deploy/NumberCube.nginx /etc/nginx/sites-available/NumberCube
ln -s /etc/nginx/sites-available/NumberCube /etc/nginx/sites-enabled/NumberCube

systemctl daemon-reload
systemctl enable NumberCube
systemctl start NumberCube

nginx -t
systemctl reload nginx
systemctl status NumberCube
```

浏览器访问：`http://服务器IP:16011`

## 技术结构

- React + TypeScript 页面
- CSS 3D Transform 实现立方体，不依赖大型 3D 库
- Node.js 生产服务
- Nginx 反向代理
- systemd 自动启动与异常重启
