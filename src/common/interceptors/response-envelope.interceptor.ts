import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiResponse } from '../interfaces/api-response.interface';

function isBinaryResponseBody(data: unknown): data is StreamableFile | Buffer {
  return data instanceof StreamableFile || Buffer.isBuffer(data);
}

@Injectable()
export class ResponseEnvelopeInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | StreamableFile | Buffer>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T> | StreamableFile | Buffer> {
    return next.handle().pipe(
      map((data) => {
        if (isBinaryResponseBody(data)) {
          return data;
        }
        return {
          success: true,
          data: data ?? null,
          meta: {},
          error: null,
        };
      }),
    );
  }
}
