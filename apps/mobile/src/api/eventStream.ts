// TypeScript uses this fallback for the extensionless import. Metro selects the
// platform-specific implementation before this file at runtime.
export { connectEventStream } from './eventStream.web';
