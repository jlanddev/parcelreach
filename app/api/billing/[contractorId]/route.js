import { NextResponse } from 'next/server';
import { getContractorBilling, updateDailyBudget } from '@/lib/stripe-billing';

// GET /api/billing/[contractorId] - Get contractor's billing info
export async function GET(request, { params }) {
  try {
    const { contractorId } = params;

    const billingInfo = await getContractorBilling(contractorId);

    if (!billingInfo) {
      return NextResponse.json(
        { error: 'Contractor not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(billingInfo);
  } catch (error) {
    console.error('Error fetching billing info:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/billing/[contractorId] - Update daily budget
export async function POST(request, { params }) {
  try {
    const { contractorId } = params;
    const { daily_budget } = await request.json();

    if (!daily_budget || daily_budget < 0) {
      return NextResponse.json(
        { error: 'Invalid budget amount' },
        { status: 400 }
      );
    }

    const success = await updateDailyBudget(contractorId, daily_budget);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to update budget' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      new_budget: daily_budget,
    });
  } catch (error) {
    console.error('Error updating budget:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
