import { MaintenanceController } from "./maintenance.controller.js";
import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller.js";
@Module({ controllers: [SettingsController, MaintenanceController] })
export class SettingsModule {}
