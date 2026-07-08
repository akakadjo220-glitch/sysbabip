# Étape 1 : Construction de l'application React/Vite
FROM node:20-alpine AS builder

WORKDIR /app

# Copie des fichiers de dépendances et installation (y compris devDependencies pour tsc et vite)
COPY package*.json ./
RUN npm install

# Copie du reste du code
COPY . .

# Arguments de construction pour injecter les variables d'environnement dans le bundle
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SERVER_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_SERVER_URL=$VITE_SERVER_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Générer le build de production (dossier dist)
RUN npm run build

# Étape 2 : Serveur Nginx de production
FROM nginx:alpine

# Copie du dossier de build Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copie de la configuration Nginx personnalisée
COPY nginx.template.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
