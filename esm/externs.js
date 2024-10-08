import { jsHost } from './host-js.js'
const { host } = jsHost

const perf = () => performance.now()

export default { host, 'performance-now': perf }
