import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import { Admin } from '../admins/entities/admin.entity';
import * as bcrypt from 'bcryptjs';
import { AdminRole } from 'src/admins/types';

function getArg(name: string, def?: string) {
  const pref = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(pref));
  return arg ? arg.slice(pref.length) : def;
}

async function bootstrap() {
  const email = getArg('email') || process.env.SA_EMAIL;
  const password = getArg('password') || process.env.SA_PASSWORD;
  const name = getArg('name') || process.env.SA_NAME || 'Super Admin';
  const force = getArg('force') === 'true' || process.env.SA_FORCE === 'true';

  if (!email || !password) {
    console.error(
      'Usage: ts-node src/seeds/create-super-admin.ts --email=you@example.com --password=Str0ngPass [--name=Name] [--force=true]',
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dataSource = app.get(DataSource);
    const repo = dataSource.getRepository(Admin);

    let admin = await repo.findOne({ where: { email: email.toLowerCase() } });

    if (!admin) {
      const hashed = await bcrypt.hash(password, 10);
      admin = repo.create({
        email: email.toLowerCase(),
        password: hashed,
        role: AdminRole.SUPER_ADMIN,
        active: true,
        name,
      } as Partial<Admin>);
      await repo.save(admin);
      console.log(`✅ SUPER_ADMIN created: ${admin.email}`);
    } else {
      if (force) {
        const hashed = await bcrypt.hash(password, 10);
        admin.password = hashed;
        admin.role = AdminRole.SUPER_ADMIN;
        admin.active = true;
        if ('name' in admin) admin.name = name;
        await repo.save(admin);
        console.log(
          `🛠️  SUPER_ADMIN updated (password/role/active): ${admin.email}`,
        );
      } else {
        console.log(
          `ℹ️  Admin already exists: ${admin.email}. Use --force=true to update password/role/active.`,
        );
      }
    }
  } catch (e) {
    console.error('Seed error:', e);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
