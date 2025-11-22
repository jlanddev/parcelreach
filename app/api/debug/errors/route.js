import { getRecentErrors, clearErrorLog } from '@/lib/error-logger';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    const errors = getRecentErrors(limit);

    return Response.json({
      success: true,
      count: errors.length,
      errors
    });
  } catch (error) {
    return Response.json(
      { error: 'Failed to fetch errors' },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    clearErrorLog();
    return Response.json({
      success: true,
      message: 'Error log cleared'
    });
  } catch (error) {
    return Response.json(
      { error: 'Failed to clear error log' },
      { status: 500 }
    );
  }
}
