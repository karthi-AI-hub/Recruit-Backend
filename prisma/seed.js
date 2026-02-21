const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Clean existing data
    await prisma.chatMessage.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.savedJob.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.message.deleteMany();
    await prisma.messageTemplate.deleteMany();
    await prisma.application.deleteMany();
    await prisma.job.deleteMany();
    await prisma.skill.deleteMany();
    await prisma.user.deleteMany();
    await prisma.company.deleteMany();

    // ─── COMPANIES ──────────────────────────────────────
    const companies = await Promise.all([
        prisma.company.create({
            data: {
                name: 'TechCorp India',
                industry: 'Technology',
                location: 'Bangalore, India',
                description: 'Leading technology company specializing in mobile and web solutions',
                employeeCount: 500,
                website: 'https://techcorp.in',
                rating: 4.5,
                reviewCount: 120,
                jobCount: 15,
            },
        }),
        prisma.company.create({
            data: {
                name: 'StartupXYZ',
                industry: 'Fintech',
                location: 'Mumbai, India',
                description: 'Fast-growing fintech startup revolutionizing digital payments',
                employeeCount: 80,
                website: 'https://startupxyz.in',
                rating: 4.2,
                reviewCount: 45,
                jobCount: 8,
            },
        }),
        prisma.company.create({
            data: {
                name: 'DesignHub',
                industry: 'Design',
                location: 'Pune, India',
                description: 'Creative design agency focused on user experience',
                employeeCount: 120,
                rating: 4.7,
                reviewCount: 88,
                jobCount: 5,
            },
        }),
        prisma.company.create({
            data: {
                name: 'CloudTech Solutions',
                industry: 'Cloud Computing',
                location: 'Hyderabad, India',
                description: 'Enterprise cloud solutions and infrastructure management',
                employeeCount: 300,
                rating: 4.3,
                reviewCount: 95,
                jobCount: 12,
            },
        }),
    ]);

    // ─── USERS ──────────────────────────────────────────
    const passwordHash = await bcrypt.hash('password123', 12);

    const recruiter1 = await prisma.user.create({
        data: {
            name: 'Priya Sharma',
            email: 'priya@techcorp.in',
            passwordHash,
            role: 'recruiter',
            phone: '+91 98765 43210',
            profileImage: null,
            headline: 'Senior Recruiter at TechCorp India',
            location: 'Bangalore, India',
            companyId: companies[0].id,
        },
    });

    const recruiter2 = await prisma.user.create({
        data: {
            name: 'Vikram Malhotra',
            email: 'vikram@startupxyz.in',
            passwordHash,
            role: 'recruiter',
            phone: '+91 98765 43211',
            headline: 'HR Lead at StartupXYZ',
            location: 'Mumbai, India',
            companyId: companies[1].id,
        },
    });

    const seeker1 = await prisma.user.create({
        data: {
            name: 'Raj Kumar',
            email: 'raj@email.com',
            passwordHash,
            role: 'job_seeker',
            phone: '+91 98765 43212',
            headline: 'Senior Flutter Developer',
            location: 'Bangalore, India',
            experience: 5,
            skills: ['Flutter', 'Dart', 'Firebase', 'REST API', 'Git'],
            currentCompany: 'Tech Startup',
            currentDesignation: 'Flutter Developer',
            expectedSalary: 2500000,
            isAvailable: true,
            noticePeriod: '30 days',
        },
    });

    const seeker2 = await prisma.user.create({
        data: {
            name: 'Anita Desai',
            email: 'anita@email.com',
            passwordHash,
            role: 'job_seeker',
            phone: '+91 98765 43213',
            headline: 'Product Manager | Ex-Flipkart',
            location: 'Mumbai, India',
            experience: 7,
            skills: ['Product Management', 'Agile', 'Data Analytics', 'User Research'],
            currentCompany: 'E-commerce Co.',
            currentDesignation: 'Senior PM',
            expectedSalary: 3000000,
            isAvailable: true,
        },
    });

    const seeker3 = await prisma.user.create({
        data: {
            name: 'Sneha Patel',
            email: 'sneha@email.com',
            passwordHash,
            role: 'job_seeker',
            headline: 'UI/UX Designer',
            location: 'Pune, India',
            experience: 3,
            skills: ['Figma', 'Adobe XD', 'UI Design', 'Prototyping', 'User Research'],
            currentDesignation: 'UI Designer',
            isAvailable: true,
        },
    });

    // ─── JOBS ───────────────────────────────────────────
    const jobs = await Promise.all([
        prisma.job.create({
            data: {
                title: 'Senior Flutter Developer',
                description: 'We are looking for an experienced Flutter developer to join our mobile team. You will be responsible for building cross-platform mobile applications using Flutter and Dart.',
                location: 'Bangalore, India',
                salaryMin: 1800000,
                salaryMax: 2500000,
                minExperience: 3,
                maxExperience: 7,
                skills: ['Flutter', 'Dart', 'REST API', 'Git', 'Firebase'],
                requirements: ['3+ years Flutter experience', 'Published apps on Play Store/App Store', 'Strong understanding of state management'],
                jobType: 'full_time',
                isRemote: false,
                isHotJob: true,
                companyId: companies[0].id,
                companyName: 'TechCorp India',
                companyLogo: null,
                companyDescription: companies[0].description,
                postedById: recruiter1.id,
                applicants: 2,
                views: 150,
            },
        }),
        prisma.job.create({
            data: {
                title: 'Product Manager',
                description: 'Join our product team to drive strategy and execution for our fintech platform. Work closely with engineering, design, and business teams.',
                location: 'Mumbai, India',
                salaryMin: 2500000,
                salaryMax: 3500000,
                minExperience: 5,
                maxExperience: 10,
                skills: ['Product Management', 'Agile', 'Data Analytics', 'Stakeholder Management'],
                requirements: ['5+ years PM experience', 'Fintech background preferred', 'MBA or equivalent'],
                jobType: 'full_time',
                isRemote: false,
                companyId: companies[1].id,
                companyName: 'StartupXYZ',
                companyDescription: companies[1].description,
                postedById: recruiter2.id,
                applicants: 1,
                views: 89,
            },
        }),
        prisma.job.create({
            data: {
                title: 'UI/UX Designer',
                description: 'Looking for a creative UI/UX designer to craft beautiful, user-centered interfaces for our clients.',
                location: 'Pune, India',
                salaryMin: 1000000,
                salaryMax: 1800000,
                minExperience: 2,
                maxExperience: 5,
                skills: ['Figma', 'Adobe XD', 'Prototyping', 'User Research'],
                requirements: ['Strong portfolio', '2+ years of UI/UX experience'],
                jobType: 'full_time',
                isRemote: true,
                isHotJob: true,
                companyId: companies[2].id,
                companyName: 'DesignHub',
                companyDescription: companies[2].description,
                postedById: recruiter1.id,
                applicants: 1,
                views: 120,
            },
        }),
        prisma.job.create({
            data: {
                title: 'Backend Developer - Node.js',
                description: 'Build scalable backend services using Node.js, Express, and PostgreSQL. Work on microservices architecture.',
                location: 'Hyderabad, India',
                salaryMin: 1500000,
                salaryMax: 2200000,
                minExperience: 3,
                maxExperience: 6,
                skills: ['Node.js', 'Express', 'PostgreSQL', 'Docker', 'AWS'],
                requirements: ['3+ years Node.js experience', 'Experience with relational databases'],
                jobType: 'full_time',
                isRemote: false,
                companyId: companies[3].id,
                companyName: 'CloudTech Solutions',
                companyDescription: companies[3].description,
                postedById: recruiter1.id,
                views: 75,
            },
        }),
        prisma.job.create({
            data: {
                title: 'React.js Developer',
                description: 'We need a frontend developer proficient in React.js to build modern web applications.',
                location: 'Remote',
                salaryMin: 1200000,
                salaryMax: 2000000,
                minExperience: 2,
                maxExperience: 5,
                skills: ['React.js', 'TypeScript', 'Redux', 'CSS', 'REST API'],
                requirements: ['2+ years React experience', 'TypeScript proficiency'],
                jobType: 'full_time',
                isRemote: true,
                companyName: 'TechCorp India',
                companyId: companies[0].id,
                postedById: recruiter1.id,
                views: 95,
            },
        }),
    ]);

    // ─── APPLICATIONS ──────────────────────────────────
    await Promise.all([
        prisma.application.create({
            data: {
                jobId: jobs[0].id,
                userId: seeker1.id,
                applicantName: 'Raj Kumar',
                status: 'shortlisted',
                coverLetter: 'I am very excited about this Flutter Developer role. With 5 years of experience building cross-platform apps...',
                appliedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
            },
        }),
        prisma.application.create({
            data: {
                jobId: jobs[0].id,
                userId: seeker3.id,
                applicantName: 'Sneha Patel',
                status: 'applied',
                appliedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            },
        }),
        prisma.application.create({
            data: {
                jobId: jobs[1].id,
                userId: seeker2.id,
                applicantName: 'Anita Desai',
                status: 'in_review',
                coverLetter: 'With 7 years of product management experience including 3 years in fintech...',
                appliedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
            },
        }),
        prisma.application.create({
            data: {
                jobId: jobs[2].id,
                userId: seeker3.id,
                applicantName: 'Sneha Patel',
                status: 'interviewed',
                appliedDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
        }),
    ]);

    // ─── MESSAGE TEMPLATES ─────────────────────────────
    await Promise.all([
        prisma.messageTemplate.create({
            data: {
                title: 'Application Received',
                body: 'Dear {{name}},\n\nThank you for applying to the {{job_title}} position at {{company}}.\n\nWe have received your application and our team will review it shortly.\n\nBest regards,\n{{recruiter_name}}\n{{company}}',
                placeholders: ['name', 'job_title', 'company', 'recruiter_name'],
                isDefault: true,
                createdById: recruiter1.id,
            },
        }),
        prisma.messageTemplate.create({
            data: {
                title: 'Application Shortlisted',
                body: 'Hi {{name}},\n\nGreat news! Your application for {{job_title}} has been shortlisted.\n\nWe would like to move forward with the next steps.\n\nBest regards,\n{{recruiter_name}}',
                placeholders: ['name', 'job_title', 'recruiter_name'],
                isDefault: true,
                createdById: recruiter1.id,
            },
        }),
        prisma.messageTemplate.create({
            data: {
                title: 'Application Rejected',
                body: 'Dear {{name}},\n\nThank you for your interest in the {{job_title}} position.\n\nAfter careful consideration, we have decided to move forward with other candidates.\n\nWe wish you the best.\n\nRegards,\n{{recruiter_name}}',
                placeholders: ['name', 'job_title', 'recruiter_name'],
                isDefault: true,
                createdById: recruiter1.id,
            },
        }),
        prisma.messageTemplate.create({
            data: {
                title: 'Interview Scheduled',
                body: 'Hi {{name}},\n\nWe would like to invite you for a discussion regarding the {{job_title}} position.\n\nPlease let us know your availability.\n\nBest regards,\n{{recruiter_name}}\n{{company}}',
                placeholders: ['name', 'job_title', 'recruiter_name', 'company'],
                isDefault: true,
                createdById: recruiter1.id,
            },
        }),
        prisma.messageTemplate.create({
            data: {
                title: 'Offer Extended',
                body: 'Dear {{name}},\n\nWe are pleased to inform you that you have been selected for the {{job_title}} position at {{company}}!\n\nOur HR team will reach out with offer details.\n\nCongratulations!\n{{recruiter_name}}',
                placeholders: ['name', 'job_title', 'company', 'recruiter_name'],
                isDefault: true,
                createdById: recruiter1.id,
            },
        }),
    ]);

    // ─── MESSAGES ──────────────────────────────────────
    await Promise.all([
        prisma.message.create({
            data: {
                fromUserId: recruiter1.id,
                toUserId: seeker1.id,
                subject: 'Application Received - Senior Flutter Developer',
                body: 'Dear Raj Kumar,\n\nThank you for applying to the Senior Flutter Developer position at TechCorp India.\n\nBest regards,\nPriya Sharma',
                isRead: true,
                sentAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
            },
        }),
        prisma.message.create({
            data: {
                fromUserId: recruiter1.id,
                toUserId: seeker1.id,
                subject: 'Application Shortlisted - Senior Flutter Developer',
                body: 'Hi Raj Kumar,\n\nGreat news! Your application has been shortlisted. We will reach out within 2-3 business days.\n\nBest regards,\nPriya Sharma',
                isRead: false,
                sentAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
            },
        }),
    ]);

    // ─── NOTIFICATIONS ────────────────────────────────
    await Promise.all([
        prisma.notification.create({
            data: {
                userId: seeker1.id,
                title: 'Application Shortlisted',
                message: 'Your application for Senior Flutter Developer has been shortlisted',
                type: 'application',
                metadata: { jobId: jobs[0].id },
            },
        }),
        prisma.notification.create({
            data: {
                userId: recruiter1.id,
                title: 'New Application',
                message: 'Raj Kumar applied for Senior Flutter Developer',
                type: 'application',
                metadata: { jobId: jobs[0].id },
            },
        }),
        prisma.notification.create({
            data: {
                userId: recruiter1.id,
                title: 'New Application',
                message: 'Sneha Patel applied for Senior Flutter Developer',
                type: 'application',
            },
        }),
    ]);

    // ─── CONVERSATIONS ────────────────────────────────
    const conv1 = await prisma.conversation.create({
        data: {
            recruiterId: recruiter1.id,
            candidateId: seeker1.id,
            jobId: jobs[0].id,
            jobTitle: 'Senior Flutter Developer',
            lastMessage: 'Looking forward to the interview!',
            lastMessageAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
            lastMessageBy: seeker1.id,
            unreadRecruiter: 1,
        },
    });

    await Promise.all([
        prisma.chatMessage.create({
            data: {
                conversationId: conv1.id,
                senderId: recruiter1.id,
                senderName: 'Priya Sharma',
                text: 'Hi Raj! We reviewed your application and would like to discuss the Flutter Developer role.',
                sentAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
                status: 'read',
                readAt: new Date(Date.now() - 23 * 60 * 60 * 1000),
            },
        }),
        prisma.chatMessage.create({
            data: {
                conversationId: conv1.id,
                senderId: seeker1.id,
                senderName: 'Raj Kumar',
                text: 'Thank you for reaching out! I am very interested in this position.',
                sentAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
                status: 'read',
            },
        }),
        prisma.chatMessage.create({
            data: {
                conversationId: conv1.id,
                senderId: recruiter1.id,
                senderName: 'Priya Sharma',
                text: 'Great! Are you available for a call next week?',
                sentAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
                status: 'read',
            },
        }),
        prisma.chatMessage.create({
            data: {
                conversationId: conv1.id,
                senderId: seeker1.id,
                senderName: 'Raj Kumar',
                text: 'Looking forward to the interview!',
                sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
                status: 'sent',
            },
        }),
    ]);

    // ─── SAVED JOBS ────────────────────────────────────
    await Promise.all([
        prisma.savedJob.create({
            data: { userId: seeker1.id, jobId: jobs[1].id },
        }),
        prisma.savedJob.create({
            data: { userId: seeker1.id, jobId: jobs[3].id },
        }),
    ]);

    // ─── SKILLS ────────────────────────────────────────
    const skillsData = [
        // Programming Languages
        { name: 'JavaScript', category: 'Programming', usageCount: 250 },
        { name: 'TypeScript', category: 'Programming', usageCount: 200 },
        { name: 'Python', category: 'Programming', usageCount: 230 },
        { name: 'Java', category: 'Programming', usageCount: 210 },
        { name: 'Kotlin', category: 'Programming', usageCount: 120 },
        { name: 'Swift', category: 'Programming', usageCount: 100 },
        { name: 'Dart', category: 'Programming', usageCount: 150 },
        { name: 'Go', category: 'Programming', usageCount: 90 },
        { name: 'Rust', category: 'Programming', usageCount: 60 },
        { name: 'C++', category: 'Programming', usageCount: 80 },
        { name: 'C#', category: 'Programming', usageCount: 95 },
        { name: 'PHP', category: 'Programming', usageCount: 85 },
        { name: 'Ruby', category: 'Programming', usageCount: 55 },
        { name: 'Scala', category: 'Programming', usageCount: 40 },
        // Frameworks & Libraries
        { name: 'Flutter', category: 'Framework', usageCount: 180 },
        { name: 'React', category: 'Framework', usageCount: 220 },
        { name: 'React Native', category: 'Framework', usageCount: 130 },
        { name: 'Angular', category: 'Framework', usageCount: 140 },
        { name: 'Vue.js', category: 'Framework', usageCount: 110 },
        { name: 'Next.js', category: 'Framework', usageCount: 125 },
        { name: 'Node.js', category: 'Framework', usageCount: 200 },
        { name: 'Express.js', category: 'Framework', usageCount: 160 },
        { name: 'Django', category: 'Framework', usageCount: 100 },
        { name: 'Spring Boot', category: 'Framework', usageCount: 110 },
        { name: 'Laravel', category: 'Framework', usageCount: 70 },
        { name: 'NestJS', category: 'Framework', usageCount: 65 },
        // Databases
        { name: 'PostgreSQL', category: 'Database', usageCount: 170 },
        { name: 'MongoDB', category: 'Database', usageCount: 150 },
        { name: 'MySQL', category: 'Database', usageCount: 140 },
        { name: 'Redis', category: 'Database', usageCount: 100 },
        { name: 'Firebase', category: 'Database', usageCount: 130 },
        { name: 'SQLite', category: 'Database', usageCount: 60 },
        // Cloud & DevOps
        { name: 'AWS', category: 'Cloud', usageCount: 190 },
        { name: 'Google Cloud', category: 'Cloud', usageCount: 120 },
        { name: 'Azure', category: 'Cloud', usageCount: 110 },
        { name: 'Docker', category: 'DevOps', usageCount: 170 },
        { name: 'Kubernetes', category: 'DevOps', usageCount: 100 },
        { name: 'CI/CD', category: 'DevOps', usageCount: 120 },
        { name: 'Jenkins', category: 'DevOps', usageCount: 70 },
        // Tools & Others
        { name: 'Git', category: 'Tool', usageCount: 250 },
        { name: 'REST API', category: 'Tool', usageCount: 200 },
        { name: 'GraphQL', category: 'Tool', usageCount: 90 },
        { name: 'Figma', category: 'Design', usageCount: 130 },
        { name: 'UI/UX', category: 'Design', usageCount: 120 },
        { name: 'Adobe XD', category: 'Design', usageCount: 60 },
        { name: 'Agile', category: 'Methodology', usageCount: 160 },
        { name: 'Scrum', category: 'Methodology', usageCount: 110 },
        { name: 'Data Analytics', category: 'Data', usageCount: 100 },
        { name: 'Machine Learning', category: 'AI', usageCount: 90 },
        { name: 'TensorFlow', category: 'AI', usageCount: 60 },
        { name: 'BLoC', category: 'Framework', usageCount: 80 },
    ];

    await prisma.skill.createMany({ data: skillsData });
    console.log(`  📊 Seeded ${skillsData.length} skills`);

    console.log('✅ Seed complete!');
    console.log('');
    console.log('Test accounts:');
    console.log('  Recruiter: priya@techcorp.in / password123');
    console.log('  Recruiter: vikram@startupxyz.in / password123');
    console.log('  Seeker:    raj@email.com / password123');
    console.log('  Seeker:    anita@email.com / password123');
    console.log('  Seeker:    sneha@email.com / password123');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
