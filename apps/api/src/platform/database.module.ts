import {
  Global,
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type OnModuleDestroy,
} from "@nestjs/common";
import type { ServerConfig } from "@simply-clean/config";
import {
  createDatabase,
  type DatabaseConnection,
} from "@simply-clean/database";

export const DATABASE_CONNECTION = Symbol("DATABASE_CONNECTION");

@Injectable()
class DatabaseLifecycle implements OnModuleDestroy {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.connection.close();
  }
}

@Global()
@Module({})
export class DatabaseModule {
  static register(config: ServerConfig): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DATABASE_CONNECTION,
          useFactory(): DatabaseConnection {
            return createDatabase(config);
          },
        },
        DatabaseLifecycle,
      ],
      exports: [DATABASE_CONNECTION],
    };
  }
}
