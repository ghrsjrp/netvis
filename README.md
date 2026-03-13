<<<<<<< HEAD
# NetVis — OSPF Topology Visualizer

Uma alternativa moderna ao Topolograph com UI drag & drop, análise de falhas e monitoramento em tempo real.

## ✨ Features

- **Upload de LSDB** — Suporte a Cisco, Juniper, FRR, Nokia, Huawei, Fortinet, Mikrotik
- **Visualização interativa** — Grafo com drag & drop via vis-network
- **Menor caminho** — Dijkstra com highlight visual do caminho
- **Simulação de falha de link** — Vê o backup path ou detecta partição de rede
- **Simulação de falha de nó** — Analisa impacto de um roteador fora do ar
- **Heatmap de centralidade** — Identifica os nós mais críticos da rede
- **Caminhos assimétricos** — Detecção de paths diferentes na ida e volta
- **Snapshots** — Salva estado da topologia em diferentes momentos
- **Dashboard de eventos** — Registra e acompanha eventos de rede (link up/down, cost change)
- **Editor manual** — Cria topologias do zero sem precisar de hardware

## 🚀 Instalação Rápida (Produção)

### Pré-requisitos
- Docker 24+
- Docker Compose v2

### Subir

```bash
git clone <repo>
cd netvis

# Produção (build completo)
docker compose up -d --build

# Acesse: http://localhost
```

### Desenvolvimento (hot reload)

```bash
docker compose -f docker-compose.dev.yml up

# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

## 📡 Como usar

### 1. Upload de LSDB (Cisco)

```
# No seu roteador Cisco:
show ip ospf database router
show ip ospf database network
show ip ospf database external

# Salve o output como arquivo .txt e faça upload em /upload
```

### 2. Análise de topologia

Após o upload, no visualizador:

| Ação | Como |
|------|------|
| Menor caminho | Clique "Menor caminho" → selecione 2 nós → Calcular |
| Falha de link | Clique "Falha de link" → selecione endpoints → Simular |
| Falha de nó | Clique "Falha de nó" → selecione o nó → Simular |
| Heatmap | Clique "Heatmap" direto |
| Mover nós | Arraste qualquer nó (posição salva automaticamente) |

### 3. API REST

A API completa está disponível em `http://localhost:8000/docs` (Swagger UI).

```bash
# Upload via API
curl -X POST http://localhost:8000/api/topologies/upload \
  -F "file=@lsdb.txt" \
  -F "name=Rede Principal" \
  -F "protocol=ospf"

# Menor caminho
curl -X POST http://localhost:8000/api/topologies/1/shortest-path \
  -H "Content-Type: application/json" \
  -d '{"source": "10.0.0.1", "target": "10.0.0.5"}'
```

## 🔧 Configuração

Variáveis de ambiente no `docker-compose.yml`:

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `SECRET_KEY` | `changeme` | Chave JWT — **troque em produção!** |
| `DATABASE_URL` | PostgreSQL local | URL do banco |
| `REDIS_URL` | Redis local | URL do Redis |

## 🏗 Arquitetura

```
netvis/
├── backend/          # FastAPI + NetworkX + SQLAlchemy
│   └── app/
│       ├── api/      # Rotas REST
│       ├── parsers/  # Parser OSPF LSDB (multi-vendor)
│       ├── services/ # Análise de grafos (Dijkstra, heatmap...)
│       └── models/   # SQLAlchemy models
├── frontend/         # React + Vite + vis-network + Tailwind
│   └── src/
│       ├── components/  # TopologyGraph, Sidebar
│       ├── pages/       # Home, Upload, Create, Monitor
│       └── utils/       # API client
└── docker-compose.yml
```

## 📦 Stack

- **Backend**: Python 3.11 · FastAPI · NetworkX · SQLAlchemy · PostgreSQL · Redis
- **Frontend**: React 18 · Vite · vis-network · Tailwind CSS · Recharts
- **Infra**: Docker · Docker Compose · Nginx

## 🤝 Diferenças vs Topolograph

| Feature | Topolograph | NetVis |
|---------|------------|--------|
| UI/UX | Funcional | Moderna, dark mode |
| Drag & Drop | ✓ | ✓ (posição persistida) |
| Análise de falhas | ✓ | ✓ |
| Heatmap | ✓ | ✓ |
| Dashboard de eventos | Monitoramento externo | ✓ Integrado |
| API REST | ✓ | ✓ (Swagger incluso) |
| Self-hosted | Docker | Docker |
| Setup | Complexo | `docker compose up` |
=======
# netvis
>>>>>>> 136449e64b5cdb95be3b9eb95bfec1bcc7d5737b
