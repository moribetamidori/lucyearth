import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

type SlotRequestPayload = {
  reels: string[];
  anonId?: string | null;
  question?: string;
};

async function fetchFortuneText(symbols: string[], question?: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('Missing Gemini API key');
  }

  const symbolMeanings: Record<string, string> = {
    '🍒': 'sweetness, new beginnings, small pleasures',
    '🍋': 'sourness turning sweet, unexpected twists, zesty energy',
    '💎': 'wealth, clarity, rare treasures, hidden value',
    '🌈': 'hope, diversity, after storms comes beauty, magic',
    '⭐️': 'success, wishes granted, destiny, bright future',
    '🍀': 'luck, fortune, rare finds, serendipity',
    '🔥': 'passion, transformation, intensity, burning desire',
    '🌙': 'dreams, intuition, mystery, nighttime revelations',
  };

  const symbolContext = symbols
    .map(s => symbolMeanings[s] || 'mystery')
    .join('; ');

  const prompt = question
    ? [
        'You are LucyEarth, a playful and mystical oracle.',
        `The seeker asks: "${question}"`,
        `Their slot combo: ${symbols.join(' | ')} (meanings: ${symbolContext}).`,
        'Answer their question directly based on the energy of these symbols.',
        'Be creative, specific, and vivid. You can be funny, mysterious, poetic, or sage-like.',
        'Vary your tone and style - sometimes be cryptic, sometimes direct, sometimes whimsical.',
        'Keep it under 50 words. No need for formal structure.',
      ].join(' ')
    : [
        'You are LucyEarth, a playful arcade oracle.',
        `Slot combo: ${symbols.join(' | ')} (meanings: ${symbolContext}).`,
        'Give a short, vivid fortune (under 45 words) inspired by these symbols.',
        'Be unpredictable - sometimes funny, sometimes mysterious, sometimes oddly specific.',
        'Vary your style: could be a prophecy, advice, observation, or cryptic riddle.',
        'No fixed format needed.',
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

    const fortuneText = await fetchFortuneText(cleanReels, body.question);

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
