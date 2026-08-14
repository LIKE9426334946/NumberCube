# NumberCube

一个支持 NumPy 风格表达式的三维数字矩阵可视化网页。输入 `a=np.random.randn(3,4,5)` 即可生成对应的 3×4×5 数字立方体，可使用鼠标或触摸拖动旋转、滚轮缩放，并按第一个维度隐藏一个或多个矩阵面。

## 功能

- 支持 `np.random.randn`、`np.random.rand`、`np.zeros` 和 `np.ones` 三维表达式
- 根据表达式动态生成三维形状和数据，每个维度支持 1—6
- 每个小方块显示对应的浮点数值
- 可分别隐藏 `a[0, :, :]`、`a[1, :, :]` 等矩阵面
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
