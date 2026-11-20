/*
 * Pricing configuration: the one place that holds the original Philippine peso (PHP)
 * prices. Every converted price on the site is calculated from these amounts.
 * To change a price, change it here (and in the fallback markup in index.html).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Z1PPricing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const BASE_CURRENCY = 'PHP';

  // Currency the checkout actually charges in. Converted prices are only a guide.
  const CHARGE_CURRENCY = 'PHP';

  // Amounts are whole pesos. `0` means the plan is free in every currency.
  const PLANS = {
    free: { php: 0 },
    student: { php: 59 },
    semester: { php: 249 },
    premium: { php: 99 },
    pro: { php: 199 }
  };

  // A semester is 5 months, so the saving versus paying monthly follows from the prices above.
  const SEMESTER_MONTHS = 5;
  const SEMESTER_SAVING_PHP = PLANS.student.php * SEMESTER_MONTHS - PLANS.semester.php;

  return { BASE_CURRENCY, CHARGE_CURRENCY, PLANS, SEMESTER_MONTHS, SEMESTER_SAVING_PHP };
});
