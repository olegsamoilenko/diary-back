import { it, expect } from '@jest/globals';
import { PeriodicAnalysisService } from './periodic-analysis.service';
import { AiModel } from 'src/users/types';

it.each([undefined, 2])(
  'keeps period dialog usage open for Luna only for contract %s',
  (version) => {
    const service = Object.create(PeriodicAnalysisService.prototype);
    const request = service.responseRequest({
      userId: 1,
      model: AiModel.GPT_5_6_TERRA,
      messages: [{ role: 'system', content: 'Fixture' }],
      reportId: 'report',
      requestId: 'same-full-cycle',
      outputLimit: 1000,
      mode: 'dialog',
      kind: 'day',
      plannerCreationVersion: version,
    });
    expect(request.accounting.traceId).toBe('same-full-cycle');
    expect(request.accounting.cycleComplete).toBe(version !== 2);
  },
);
