import { Link, createFileRoute } from '@tanstack/react-router'
import { MessageCircle } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="relative flex h-[calc(100vh-32px)] bg-gray-900">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-3xl mx-auto w-full">
          <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-orange-500 to-red-600 text-transparent bg-clip-text uppercase">
            <span className="text-white">TanStack</span> Chat
          </h1>
          <p className="text-gray-400 mb-6 w-2/3 mx-auto text-lg">
            You can ask me about anything, I might or might not have a good
            answer, but you can still ask.
          </p>
          <Link
            to="/chat"
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-lg shadow-orange-500/50"
          >
            <MessageCircle className="w-5 h-5" />
            <span>Start Chatting</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

