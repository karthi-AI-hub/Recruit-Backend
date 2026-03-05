function getPlanTier(subscriptionPlan) {
    if (typeof subscriptionPlan !== 'string' || subscriptionPlan.trim().length === 0) {
        return null;
    }

    const raw = subscriptionPlan.split('(')[0].trim().toLowerCase();

    if (raw === 'premium') return 'Premium';
    if (raw === 'custom') return 'Custom';
    if (raw === 'normal') return 'Normal';
    if (raw === 'free trial') return 'Normal';

    return null;
}

function hasActiveSubscription(company) {
    if (!company) return false;
    const status = (company.subscriptionStatus || '').toLowerCase();
    const isActive = status === 'active' || status === 'trialing';
    const isExpired = company.trialEndsAt && new Date(company.trialEndsAt) < new Date();
    return isActive && !isExpired;
}

function canAccessAnalytics(company) {
    const tier = getPlanTier(company?.subscriptionPlan);
    return tier === 'Premium' || tier === 'Custom';
}

function canViewDirectContact(company) {
    const tier = getPlanTier(company?.subscriptionPlan);
    return tier === 'Premium' || tier === 'Custom';
}

module.exports = {
    getPlanTier,
    hasActiveSubscription,
    canAccessAnalytics,
    canViewDirectContact,
};
