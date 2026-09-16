const mealCards = [...document.querySelectorAll('.meal-card')];
const searchInput = document.querySelector('#meal-search');
const filterButtons = [...document.querySelectorAll('[data-filter]')];
const resultCount = document.querySelector('#result-count');
const emptyState = document.querySelector('#empty-state');
const balanceInput = document.querySelector('#balance-input');
const daysInput = document.querySelector('#days-input');
const budgetError = document.querySelector('#budget-error');
const dailyBudget = document.querySelector('#daily-budget');
const budgetEquation = document.querySelector('#budget-equation');
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

let activeFilter = 'all';

function matchesFilter(card) {
  const price = Number(card.dataset.price);
  const protein = Number(card.dataset.protein);
  if (activeFilter === 'under9') return price < 9;
  if (activeFilter === 'protein') return protein >= 30;
  if (activeFilter === 'vegetarian') return card.dataset.vegetarian === 'true';
  return true;
}

function renderMeals() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const matches = mealCards.filter((card) => {
    const words = `${card.dataset.name} ${card.dataset.tags}`.toLocaleLowerCase();
    return words.includes(query) && matchesFilter(card);
  });

  mealCards.forEach((card) => { card.hidden = !matches.includes(card); });
  resultCount.textContent = `${matches.length} sample ${matches.length === 1 ? 'meal' : 'meals'}`;
  emptyState.hidden = matches.length !== 0;
  return matches.map((card) => card.dataset.name);
}

function selectFilter(filter) {
  if (!['all', 'under9', 'protein', 'vegetarian'].includes(filter)) return renderMeals();
  activeFilter = filter;
  filterButtons.forEach((button) => {
    const selected = button.dataset.filter === filter;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  return renderMeals();
}

filterButtons.forEach((button) => button.addEventListener('click', () => selectFilter(button.dataset.filter)));
searchInput.addEventListener('input', renderMeals);
document.querySelector('#reset-filters').addEventListener('click', () => {
  searchInput.value = '';
  selectFilter('all');
  searchInput.focus();
});

function updateBudget(rawBalance, rawDays) {
  const balance = Number(rawBalance);
  const days = Number(rawDays);
  const valid = rawBalance !== '' && rawDays !== '' && Number.isFinite(balance) && Number.isInteger(days)
    && balance >= 0 && balance <= 10000 && days >= 1 && days <= 365;

  if (!valid) {
    budgetError.textContent = 'Enter a balance from $0 to $10,000 and whole days from 1 to 365.';
    budgetError.hidden = false;
    return null;
  }

  budgetError.textContent = '';
  budgetError.hidden = true;
  const roundedBalance = Math.round(balance * 100) / 100;
  const daily = Math.floor((roundedBalance / days) * 100) / 100;
  dailyBudget.textContent = money.format(daily);
  budgetEquation.textContent = `${money.format(roundedBalance)} across ${days} ${days === 1 ? 'day' : 'days'}`;
  return { daily, balance: roundedBalance, days };
}

document.querySelector('#budget-form').addEventListener('submit', (event) => {
  event.preventDefault();
  updateBudget(balanceInput.value, daysInput.value);
});

renderMeals();
updateBudget(balanceInput.value, daysInput.value);

if (document.modelContext?.registerTool) {
  try {
    document.modelContext.registerTool({
      name: 'filter_bitefind_sample_meals',
      description: 'Filter the three illustrative BiteFind meals in this page. Results are sample data.',
      inputSchema: { type: 'object', properties: {
        filter: { type: 'string', enum: ['all', 'under9', 'protein', 'vegetarian'] },
        query: { type: 'string' },
      }, required: ['filter'] },
      annotations: { readOnlyHint: false },
      execute: ({ filter, query = '' }) => {
        searchInput.value = query;
        const meals = selectFilter(filter);
        return { content: [{ type: 'text', text: JSON.stringify({ meals, count: meals.length, sampleData: true }) }] };
      },
    });
    document.modelContext.registerTool({
      name: 'calculate_bitefind_sample_budget',
      description: 'Calculate a sample daily dining budget from a user-entered balance and days remaining.',
      inputSchema: { type: 'object', properties: {
        balance: { type: 'number', minimum: 0, maximum: 10000 },
        days: { type: 'integer', minimum: 1, maximum: 365 },
      }, required: ['balance', 'days'] },
      annotations: { readOnlyHint: false },
      execute: ({ balance, days }) => {
        balanceInput.value = String(balance);
        daysInput.value = String(days);
        const result = updateBudget(balanceInput.value, daysInput.value);
        return { content: [{ type: 'text', text: JSON.stringify({ ...result, sampleData: true }) }] };
      },
    });
  } catch (error) {
    console.warn('Optional browser tools are unavailable.', error);
  }
}
