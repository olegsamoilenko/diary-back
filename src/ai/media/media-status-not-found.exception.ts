import { NotFoundException } from '@nestjs/common';

/** A status probe may miss after cleanup; clients restore their local replay. */
export class MediaStatusNotFoundException extends NotFoundException {}
