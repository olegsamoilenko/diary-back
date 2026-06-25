import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PaymentsService } from './payments.service';
import { Platform } from 'src/common/types/platform';

describe('PaymentsService', () => {
  const paymentRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  let service: PaymentsService;

  const paymentData = {
    platform: Platform.ANDROID,
    regionCode: 'UA',
    orderId: 'GPA.1',
    amount: 394.99,
    currency: 'UAH',
    user: { id: 167 },
    plan: { id: 58 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentsService(paymentRepository as any);
  });

  it('returns an existing payment when orderId is already stored', async () => {
    const existing = { id: 1, orderId: 'GPA.1' };
    (paymentRepository.findOne as any).mockResolvedValueOnce(existing);

    const result = await service.create(paymentData as any);

    expect(result).toBe(existing);
    expect(paymentRepository.create).not.toHaveBeenCalled();
    expect(paymentRepository.save).not.toHaveBeenCalled();
  });

  it('creates and saves a new payment when orderId is not found', async () => {
    const created = { id: undefined, ...paymentData };
    const saved = { id: 1, ...paymentData };
    (paymentRepository.findOne as any).mockResolvedValueOnce(null);
    (paymentRepository.create as any).mockReturnValueOnce(created);
    (paymentRepository.save as any).mockResolvedValueOnce(saved);

    const result = await service.create(paymentData as any);

    expect(result).toBe(saved);
    expect(paymentRepository.create).toHaveBeenCalledWith(paymentData);
    expect(paymentRepository.save).toHaveBeenCalledWith(created);
  });

  it('recovers from unique orderId races by returning the existing payment', async () => {
    const existing = { id: 1, orderId: 'GPA.1' };
    (paymentRepository.findOne as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    (paymentRepository.create as any).mockReturnValueOnce(paymentData);
    (paymentRepository.save as any).mockRejectedValueOnce({ code: '23505' });

    const result = await service.create(paymentData as any);

    expect(result).toBe(existing);
    expect(paymentRepository.findOne).toHaveBeenLastCalledWith({
      where: { orderId: 'GPA.1' },
    });
  });

  it('rethrows non-unique save errors', async () => {
    const error = new Error('db failed');
    (paymentRepository.findOne as any).mockResolvedValueOnce(null);
    (paymentRepository.create as any).mockReturnValueOnce(paymentData);
    (paymentRepository.save as any).mockRejectedValueOnce(error);

    await expect(service.create(paymentData as any)).rejects.toThrow(
      'db failed',
    );
  });

  it('does not try to dedupe payments without orderId', async () => {
    const paymentWithoutOrder = { ...paymentData, orderId: null };
    const saved = { id: 1, ...paymentWithoutOrder };
    (paymentRepository.create as any).mockReturnValueOnce(paymentWithoutOrder);
    (paymentRepository.save as any).mockResolvedValueOnce(saved);

    const result = await service.create(paymentWithoutOrder as any);

    expect(result).toBe(saved);
    expect(paymentRepository.findOne).not.toHaveBeenCalled();
  });
});
