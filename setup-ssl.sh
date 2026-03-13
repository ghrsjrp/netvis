#!/bin/bash
# ─────────────────────────────────────────────────────────────
# NetVis — Let's Encrypt SSL setup
# Uso: ./setup-ssl.sh seu.dominio.com seu@email.com
# ─────────────────────────────────────────────────────────────
set -e

DOMAIN=$1
EMAIL=$2

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Uso: ./setup-ssl.sh <dominio> <email>"
  echo "Ex:  ./setup-ssl.sh netvis.openx.com.br admin@openx.com.br"
  exit 1
fi

echo "▶ Domínio: $DOMAIN"
echo "▶ Email:   $EMAIL"
echo ""

# 1. Substituir DOMAIN no nginx.conf
echo "[1/5] Configurando nginx.conf com domínio $DOMAIN..."
sed -i "s/DOMAIN/$DOMAIN/g" frontend/nginx.conf

# 2. Subir com config HTTP temporária (sem SSL) para o Certbot poder validar
echo "[2/5] Subindo nginx temporário (HTTP only) para validação ACME..."
cp frontend/nginx.conf frontend/nginx-ssl.conf.bak
cp frontend/nginx-pre-ssl.conf frontend/nginx.conf
docker compose up -d --build frontend db redis backend
sleep 5

# 3. Emitir certificado
echo "[3/5] Emitindo certificado Let's Encrypt..."
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

# 4. Restaurar nginx com SSL
echo "[4/5] Ativando nginx com HTTPS..."
cp frontend/nginx-ssl.conf.bak frontend/nginx.conf
docker compose up -d --build frontend

# 5. Verificar
echo "[5/5] Verificando..."
sleep 3
curl -sk https://$DOMAIN/health | grep -q "ok" && \
  echo "✅ HTTPS funcionando em https://$DOMAIN" || \
  echo "⚠️  Verifique manualmente: https://$DOMAIN"

echo ""
echo "Renovação automática: certbot roda a cada 12h via docker compose"
echo "Para renovar manualmente: docker compose run --rm certbot renew"
