import { registerRootComponent } from 'expo';

// Platform: .native.ts đăng ký TaskManager; .web.ts no-op (tránh crash web).
import './tasks/backgroundSessionTask';
import './tasks/backgroundPositionTask';
import App from './App';

registerRootComponent(App);
