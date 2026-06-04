# Build the TypeScript, then run only the compiled output + prod deps.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# Most hosts inject PORT; default to 3000 locally.
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/http.js"]
