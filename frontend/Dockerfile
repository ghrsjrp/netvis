FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package.json ./

# Clean install with fixed vite version that works on Node 20 Alpine
RUN npm install --legacy-peer-deps && \
    npm install vite@5.2.13 @vitejs/plugin-react@4.3.1 --save-dev --legacy-peer-deps

COPY . .

# Build using node directly to avoid broken symlink
RUN node node_modules/vite/bin/vite.js build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
