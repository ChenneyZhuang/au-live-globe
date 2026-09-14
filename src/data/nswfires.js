import {
  createNswFiresLayer as createLayer,
  createNswFiresSource,
} from '../layers/nswfires/index.js';
import { registerDynamicCredit } from './dataCredits.js';

const RFS_CREDIT = {
  key: 'nsw-rfs',
  html:
    '<a href="https://www.rfs.nsw.gov.au/" target="_blank" rel="noopener">NSW Rural Fire Service</a>' +
    ' — major incidents feed (CC BY 4.0)',
};

/** Wire the standalone source and the attribution credit. */
export function createNswFiresLayer({
  source = createNswFiresSource(),
  credits = { register: registerDynamicCredit, credit: RFS_CREDIT },
} = {}) {
  return createLayer({ source, credits });
}
export default createNswFiresLayer();
