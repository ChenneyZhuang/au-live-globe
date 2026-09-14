import {
  createQldFiresLayer as createLayer,
  createQldFiresSource,
} from '../layers/qldfires/index.js';
import { registerDynamicCredit } from './dataCredits.js';

const QFD_CREDIT = {
  key: 'qld-qfd',
  html:
    '<a href="https://www.fire.qld.gov.au/" target="_blank" rel="noopener">Queensland Fire Department</a>' +
    ' — bushfire warnings feed (CC BY 4.0)',
};

/** Wire the proxied source and the attribution credit. */
export function createQldFiresLayer({
  source = createQldFiresSource(),
  credits = { register: registerDynamicCredit, credit: QFD_CREDIT },
} = {}) {
  return createLayer({ source, credits });
}
export default createQldFiresLayer();
