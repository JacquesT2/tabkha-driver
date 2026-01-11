import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase-auth/middleware'

export async function middleware(request: NextRequest) {
    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - api/ (API routes - generally stateless or handle their own auth checks, but we may want to protect them too? 
         *         For now exclude API to avoid CORS/Auth issues with server-side calls if any. 
         *         Actually better to include them if they need user context.
         *         Let's stick to standard pattern excluding static assets)
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
