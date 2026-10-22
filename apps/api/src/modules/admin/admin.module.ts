import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminFinanceService } from './admin-finance.service';
import { AdminVerificationService } from './admin-verification.service';

@Module({ controllers: [AdminController], providers: [AdminVerificationService, AdminFinanceService] })
export class AdminModule {}
