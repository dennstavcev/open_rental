import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { LeaseMetersController } from './lease-meters.controller';
import { MeterReadingsController } from './meter-readings.controller';

function routesOf(controller: object) {
  const prototype = Object.getPrototypeOf(controller) as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => {
      const handler = prototype[name];
      return {
        path: Reflect.getMetadata(PATH_METADATA, handler as object),
        method: Reflect.getMetadata(METHOD_METADATA, handler as object),
      };
    })
    .filter(({ method }) => method !== undefined);
}

describe('маршруты показаний счётчиков', () => {
  it('старый контроллер сохраняет POST, но больше не содержит GET', () => {
    const controller = new MeterReadingsController({} as never);
    const routes = routesOf(controller);

    expect(
      routes.filter(({ method }) => method === RequestMethod.GET),
    ).toEqual([]);
    expect(routes).toContainEqual({ path: '/', method: RequestMethod.POST });
  });

  it('история смонтирована под договором', () => {
    const controller = new LeaseMetersController({} as never, {} as never);
    const routes = routesOf(controller);

    expect(
      Reflect.getMetadata(PATH_METADATA, LeaseMetersController),
    ).toBe('leases/:leaseId/meters');
    expect(routes).toContainEqual({
      path: ':meterId/readings',
      method: RequestMethod.GET,
    });
  });
});
