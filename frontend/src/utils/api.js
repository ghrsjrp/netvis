import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const topologyApi = {
  list: () => api.get('/topologies/'),
  get: (id) => api.get(`/topologies/${id}`),
  upload: (formData) => api.post('/topologies/upload', formData),
  createManual: (data) => api.post('/topologies/manual', data),
  update: (id, data) => api.put(`/topologies/${id}`, data),
  delete: (id) => api.delete(`/topologies/${id}`),
  shortestPath: (id, source, target, excludedNodes = []) =>
    api.post(`/topologies/${id}/shortest-path`, { source, target, excluded_nodes: excludedNodes }),
  simulateLinkFailure: (id, data) =>
    api.post(`/topologies/${id}/simulate-link-failure`, data),
  simulateNodeFailure: (id, nodeId) =>
    api.post(`/topologies/${id}/simulate-node-failure`, { node_id: nodeId }),
  heatmap: (id) => api.get(`/topologies/${id}/heatmap`),
  stats: (id) => api.get(`/topologies/${id}/stats`),
  events: (id) => api.get(`/topologies/${id}/events`),
  addEvent: (id, event) => api.post(`/topologies/${id}/events`, event),
  snapshots: (id) => api.get(`/topologies/${id}/snapshots`),
  createSnapshot: (id) => api.post(`/topologies/${id}/snapshots`),
  snmpHostname: (id, data) => api.post(`/topologies/${id}/snmp-hostname`, data),
}

export const physicalApi = {
  // Devices
  listDevices:   ()           => api.get('/physical/devices'),
  addDevice:     (data)       => api.post('/physical/devices', data),
  addDevicesBulk:(list)       => api.post('/physical/devices/bulk', list),
  updateDevice:  (id, data)   => api.put(`/physical/devices/${id}`, data),
  deleteDevice:  (id)         => api.delete(`/physical/devices/${id}`),
  testDevice:    (id)         => api.post(`/physical/devices/${id}/test`),
  wikiImport:    (data)       => api.post('/physical/devices/wiki-import', data),
  scanDevice:    (id)         => api.post(`/physical/devices/${id}/scan`),
  scanStatus:    (id)         => api.get(`/physical/devices/${id}/scan-status`),
  // Topologies
  listTopologies:  ()     => api.get('/physical/topologies'),
  listGroups:      ()     => api.get('/physical/groups'),
  getTopology:     (id)   => api.get(`/physical/topologies/${id}`),
  latestTopology:  ()     => api.get('/physical/topologies/latest'),
  deleteTopology:  (id)   => api.delete(`/physical/topologies/${id}`),
  // Crawl
  startCrawl:   (data)  => api.post('/physical/crawl', data),
  crawlStatus:  (id)    => api.get(`/physical/crawl/${id}/status`),
}

export default api
