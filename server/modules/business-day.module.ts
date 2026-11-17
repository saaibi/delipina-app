import { Module } from "@nestjs/common";
import { BusinessDayController } from "./business-day.controller.js";
@Module({ controllers: [BusinessDayController] })
export class BusinessDayModule {}
