import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

type SlotRequestPayload = {
  reels: string[];
  anonId?: string | null;
};

async function fetchFortuneText(symbols: string[]): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('Missing Gemini API key');
  }

  const prompt = [
    'You are the mischievous LucyEarth arcade oracle.',
    'Return exactly one short prophecy (max 45 words) that feels specific and vivid.',
    'Blend oddly precise claims like “$1,000 windfall next month,” “your pottery skills level up,” or “text that person at 11:11.”',
    'You may be funny, spicy, neutral, or sweet, but never apologetic or negative.',
    `Today’s slot combo: ${symbols.join(' | ')}.`,
    'Reference those icons loosely and end with a wink, flourish, or dramatic mic drop.',
  ].join(' ');

  const response = await fetch(
    `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.95,
          topP: 0.9,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Gemini API error (${response.status}): ${errorBody || response.statusText}`
    );
  }

  const data = await response.json();
  const textParts =
    data?.candidates?.[0]?.content?.parts?.map(
      (part: { text?: string }) => part.text ?? ''
    ) ?? [];
  const fortune = textParts.join('').trim();
  return fortune || 'Lucky energy follows you today—expect delightful surprises.';
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SlotRequestPayload;
    if (!body || !Array.isArray(body.reels) || body.reels.length !== 3) {
      return NextResponse.json(
        { error: 'Three reels are required.' },
        { status: 400 }
      );
    }

    const cleanReels = body.reels.map((symbol) =>
      typeof symbol === 'string' ? symbol : String(symbol ?? '')
    );

    const fortuneText = await fetchFortuneText(cleanReels);

    const { data, error } = await supabase
      .from('slot_machine_spins')
      .insert({
        anon_id: body.anonId || null,
        reel_one: cleanReels[0],
        reel_two: cleanReels[1],
        reel_three: cleanReels[2],
        fortune_text: fortuneText,
        fortune_model: GEMINI_MODEL,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      fortune: fortuneText,
      spin: data,
    });
  } catch (error) {
    console.error('Slot machine fortune error:', error);
    const message =
      error instanceof Error ? error.message : 'Unable to spin slot machine.';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
