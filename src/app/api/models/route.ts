import { NextResponse } from 'next/server';
import { getAvailableModels } from '@/lib/ai/models';

export async function GET() {
  return NextResponse.json(getAvailableModels());
}
