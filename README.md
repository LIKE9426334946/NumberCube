# NumberCube

一个简洁的 3×3×3 三维数字矩阵可视化网页。27 个半透明小立方体分别显示数字 1—27，可使用鼠标或触摸拖动旋转，使用滚轮缩放，并能调节单元间距以观察内部结构。

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
