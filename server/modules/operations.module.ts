import { DeliveryRoutesController } from "./delivery-routes.controller.js";
import { SchedulesController } from "./schedules.controller.js";
import { Module } from "@nestjs/common";
import { OperationsController } from "./operations.controller.js";
@Module({
  controllers: [
    OperationsController,
    SchedulesController,
    DeliveryRoutesController,
  ],
})
export class OperationsModule {}
