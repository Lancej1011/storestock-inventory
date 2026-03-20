import { httpServer } from './app.js';
import { logger } from './utils/logger.js';

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
