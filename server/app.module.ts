import {InventoryModule} from "./modules/inventory.module.js";
import { OperationsModule } from "./modules/operations.module.js";
import { CreditsModule } from "./modules/credits.module.js";
import { AnalyticsModule } from "./modules/analytics.module.js";
import { BusinessDayModule } from "./modules/business-day.module.js";
import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth.module.js";
import { CatalogModule } from "./modules/catalog.module.js";
import { CustomersModule } from "./modules/customers.module.js";
import { SettingsModule } from "./modules/settings.module.js";
import { OrdersModule } from "./modules/orders.module.js";
import { PaymentsModule } from "./modules/payments.module.js";
import { NotificationsModule } from "./modules/notifications.module.js";
@Module({
  imports: [InventoryModule,
    OperationsModule,
    CreditsModule,
    AnalyticsModule,
    BusinessDayModule,
    AuthModule,
    CatalogModule,
    CustomersModule,
    SettingsModule,
    OrdersModule,
    PaymentsModule,
    NotificationsModule,
  ],
})
export class AppModule {}
