# Stage 1: Build the Vite application
FROM node:24-alpine AS builder
WORKDIR /app

# Leverage caching for npm install
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build
# (If TypeScript throws errors again, change the line above to: RUN npx vite build)

# Stage 2: Serve with Nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]