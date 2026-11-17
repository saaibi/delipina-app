import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth.module.js";
import { CatalogModule } from "./modules/catalog.module.js";
import { CustomersModule } from "./modules/customers.module.js";
import { SettingsModule } from "./modules/settings.module.js";
import { OrdersModule } from "./modules/orders.module.js";
import { PaymentsModule } from "./modules/payments.module.js";
import { NotificationsModule } from "./modules/notifications.module.js";
@Module({
  imports: [
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
