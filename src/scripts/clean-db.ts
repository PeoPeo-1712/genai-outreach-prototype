import { prisma } from '../lib/prisma';

async function main() {
    console.log('[Prisma Clean] Clearing candidates & messages...');

    const deletedMsgs = await prisma.message.deleteMany({});
    const deletedCands = await prisma.candidate.deleteMany({});
    console.log(`✔ Đã xóa ${deletedCands.count} ứng viên (Candidates)`);
    console.log(`✔ Đã xóa ${deletedMsgs.count} tin nhắn (Messages)`);

    const resetAll = process.argv.includes('--all');
    if (resetAll) {
        const deletedAuth = await prisma.xAuthConnection.deleteMany({});
        const deletedRates = await prisma.rateLimitLog.deleteMany({});
        console.log(`✔ Đã xóa ${deletedAuth.count} phiên đăng nhập X (XAuthConnection)`);
        console.log(`✔ Đã xóa ${deletedRates.count} lịch sử RateLimitLog`);
    } else {
        console.log('ℹ Giữ nguyên kết nối tài khoản X của bạn (Dùng "npm run db:clean -- --all" nếu muốn xóa cả tài khoản X).');
    }

    console.log('[Prisma Clean] Hoàn tất! Database đã sạch sẽ.');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
